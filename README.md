# Extract DJI video

## Purpose
This tools extract 1 frame every second of a DJI dron video and geotags it. The goal is to use those images in photogrammetry softwares, such as WebODM.

## Dependencies
You need:
* node >= v10.12.0
* ffmpeg
* exiftool

## Usage
```bash
node extract.js --help
Usage: extract.js <videoFile> [options]

Options:
      --version      Show version number                               [boolean]
  -d, --destination  Destination directory                              [string]
  -p, --prefix       Prefix to add to the generated filenames (otherwise, same
                     as source filename)                                [string]
  -h, --help         Show help                                         [boolean]
  ```

Example:
```bash
node extract.js ~/Pictures/DJI_0166.MP4 -d ./test
```
And you'll get all your geotagged images in the test subdirectory.

## Licence
MIT