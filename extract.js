const fs = require('fs')
const path = require('path')

const yargs = require('yargs')
const DJISRTParser = require('dji_srt_parser')
const ffmpeg = require('fluent-ffmpeg')
const exiftool = require('node-exiftool')


function extractImages(videoFile, destination, prefix) {
    const targetFile = path.join(destination, prefix + '_%06d.jpg')
    return new Promise(resolve => {
        ffmpeg(videoFile)
            .on('end', function () {
                console.log('Ffmpeg processing finished')
                resolve(true)
            })
            .videoFilters('fps=1/1')
            .outputOptions([
                '-qmin 1',
                '-qscale:v 1'
            ])
            .save(targetFile)
    })
}

function extractGpsTrack(videoFile, destination, prefix) {
    return new Promise(resolve => {
        const outputSubtitles = path.join(destination, prefix + '.srt')

        ffmpeg(videoFile)
            .on('end', function () {
                console.log('Ffmpeg subtitle processing finished')
                const track = parseTrack(outputSubtitles, destination, prefix)
                resolve(track)
            })
            .save(outputSubtitles)
    })
}

async function processImageFiles(videoFile, gpsTrack, destination, prefix) {
    const ep = new exiftool.ExiftoolProcess()
    await ep.open()
    const commonMetadata = await exifFromVideo(ep, videoFile)
    console.log(commonMetadata)

    const fileRegEx = new RegExp('^' + prefix + '_(\\d{6}).jpg$')
    const files = fs.readdirSync(destination)
    for(let file of files) {
        const basefile = path.basename(file)
        const match = basefile.match(fileRegEx)
        if (match) {
            const zidx = parseInt(match[1], 10) - 1
            const fullpath = path.join(destination, file)
            await processSingleImage(ep, commonMetadata, gpsTrack, fullpath, zidx)
        }
    }

    await ep.close()
}

async function exifFromVideo(exifToolProcess, videoFile) {
    const exiftoolOutput = await exifToolProcess.readMetadata(videoFile, ['CreateDate'])
    const createDate = exiftoolOutput.data[0].CreateDate
    return {
        CreateDate: createDate,
        FocalLength: 4.5,
        FocalLengthIn35mmFormat: 24.0,
    }
}

async function processSingleImage(exifToolProcess, commonMetadata, gpsTrack, filename, idx) {
    // Get the GPS information for the image
    const trackpoint = gpsTrack[idx]
    //console.log(trackpoint)

    // Build the metadata: shallow copy of the common metadata
    const newMetadata = {...commonMetadata}

    // Set new metadata from trackpoint
    newMetadata['exif:gpslatitude'] = Math.abs(trackpoint.GPS[1])
    newMetadata['exif:GPSLatitudeRef'] = trackpoint.GPS[1]
    newMetadata['exif:gpslongitude'] = Math.abs(trackpoint.GPS[0])
    newMetadata['exif:GPSLongitudeRef'] = trackpoint.GPS[0]

    // Altitude from barometer, more precise than GPS
    newMetadata['exif:gpsaltitude'] = Math.abs(trackpoint.H)
    newMetadata['exif:GPSAltitudeRef'] = trackpoint.H
    //newMetadata['exif:gpsaltitude'] = Math.abs(trackpoint.GPS[2])
    //newMetadata['exif:GPSAltitudeRef'] = trackpoint.GPS[2]
    newMetadata['exif:GPSSpeed'] = trackpoint.H_S // km/h
    newMetadata['exif:GPSSpeedRef'] = 'K'

    newMetadata['exif:ShutterSpeedValue'] = trackpoint.SS
    newMetadata['exif:ISO'] = trackpoint.ISO
    newMetadata['exif:DigitalZoomRatio'] = trackpoint.DZOOM
    newMetadata['exif:ApertureValue'] = trackpoint.F
    newMetadata['exif:ExposureCompensation'] = trackpoint.EV

    // Save EXIF tags to the image
    await exifToolProcess.writeMetadata(filename, newMetadata, ['overwrite_original'])

    // Adjust time offset
    const timeOffset = trackpoint.TIMECODE.split(',')[0]
    await exifToolProcess.readMetadata(filename, ['CreateDate+=' + timeOffset, 'overwrite_original'])

    console.log("Tagged: " + path.basename(filename))
}

function parseTrack(srtFile, destination, prefix) {
    const data = fs.readFileSync(srtFile, 'utf8')
    const DJIData = DJISRTParser(data, srtFile)
    const geoJSON = DJIData.toGeoJSON()

    // Store the track as GeoJSON asynchronously - it's not used for the processing
    const geojsonPath = path.join(destination, prefix + '.geojson')
    fs.writeFile(geojsonPath, geoJSON, err => {
        if (err) {
            console.error(err)
            return
        }
    })

    return DJIData.rawMetadata()
}

async function main() {
    // Get arguments
    const arguments = yargs(process.argv.slice(2))
        .usage('Usage: $0 <videoFile> [options]')
        .demandCommand(1)
        .option('destination', {
            alias: 'd',
            description: 'Destination directory',
            type: 'string',
        })
        .option('prefix', {
            alias: 'p',
            description: 'Prefix to add to the generated filenames (otherwise, same as source filename)',
            type: 'string',
        })
        .help()
        .alias('help', 'h')
        .argv

    // Source video file
    const videofile = arguments._[0]

    // Destination directory
    let destination = '.' 
    if (arguments.destination) {
        destination = arguments.destination
    }
    destination = path.resolve(destination)
    // Make directory
    fs.mkdirSync(destination, {recursive: true})

    // Output files prefix
    let prefix = path.parse(videofile).name
    if (arguments.prefix) {
        prefix = arguments.prefix
    }

    // Extract data from the video file
    let gpsTrack = await extractGpsTrack(videofile, destination, prefix)
    await extractImages(videofile, destination, prefix)

    // Build and save complete EXIF information
    await processImageFiles(videofile, gpsTrack, destination, prefix)
}

main()