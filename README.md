# ACE Assist

This app provides endpoints for media transforms, PDF generation and convenience methods for managing S3 compatible assets. It's a Nodejs/Express app distributed as a Docker image.

Resized images are cached but it's advisable to use a CDN in front of the app and/or a high powered host.

The app leans heavily on the mighty [sharp](https://github.com/lovell/sharp) library for image operations.

&nbsp;
### /:slug/file/upload `[POST]`

[Flow.js](https://github.com/flowjs/flow.js) compatible upload target.

| Param | Description |
| --- | --- |
| `slug` | Project slug/folder |

| Data | Description |
| --- | --- |
| `options` | JSON containing upload options, see below... |

#### Upload options

| Option | Description |
| --- | --- |
| `dzi` | Deep Zoom image options |

&nbsp;
### /:slug/file/delete `[POST]`

| Param | Description |
| --- | --- |
| `slug` | Project slug/folder |

| Data | Description |
| --- | --- |
| `fileNames[]` | Array of filenames to delete |

&nbsp;
### /:slug/transform/:options/:fileName `[GET]`

Resizes the requested image on-demand.

| Param | Description |
| --- | --- |
| `slug` | Project slug/folder |
| `filename` | File to be transformed |
| `options` | Serialized transform options, see below... |

### Transform options

Options should be in the following format:

    option:value

Multiple options can be combined with semi-colons:

    w:200;h:200;g:attention

**Image Options**

| Option | Description |
| --- | --- |
| `f` | Output format: `jpg`, `png`, `webp` |
| `w` | Width in pixels or as a percentage if < 1 |
| `h` | Height in pixels or as a percentage if < 1 |
| `q` | Quality `1-100` (jpeg, webp) |
| `sm` | Scale mode: `fit` or `fill` |
| `g` | AUTO Crop method: `north`, `south`, `east`, `west`, `center`, `entropy`, `attention` |
| `x` | MANUAL Crop method top-left x-axis coord  `0-1` |
| `y` | MANUAL Crop method top-left y-axis coord  `0-1` |
| `x2` | MANUAL Crop method bottom-right x-axis coord  `0-1` |
| `y2` | MANUAL Crop method bottom-right y-axis coord  `0-1` |
| `bl` | Blur `0.3+` |
| `sh` | Sharpen `0.5+` |

**Video Options**

| Option | Description |
| --- | --- |
| `f` | Output format: `mp4`, `webm` |
| `w` | Width in pixels |
| `h` | Height in pixels |
| `bv` | Video bitrate |
| `ba` | Audio bitrate |


&nbsp;
### /:slug/pdf/download `[POST]`

Accepts a POST request with a JSON `payload` in the request body. Uses [PDFkit](https://github.com/devongovett/pdfkit) to generate PDFs.

| Parameter | Description |
| --- | --- |
| `slug` | Project slug/folder |

    {
        "fileName": "lightbox.pdf",
        "layout": "landscape",
        "size": "A4",
        "margin": 0,
        "fonts": {
            "fontname": "https://www.example.com/fonts/example.ttf"
        },
        "assets": {
            "logo": "https://www.example.com/img/logo.png"
        },
        "pages": [
            [
                {
                    "image": [
                        "logo",
                        36,
                        36,
                        {
                            "fit": [
                                200,
                                200
                            ]
                        }
                    ]
                },
                {
                    "fontSize": 12
                },
                {
                    "font": "fontname"
                },
                {
                    "text": [
                        "Copyright © 2017 Example. All Rights Reserved.",
                        36,
                        550,
                        {
                            "width": 769,
                            "align": "right"
                        }
                    ]
                }
            ],
            [
                {
                    "image": [
                        "slug/filename.jpg",
                        36,
                        36,
                        {
                            "fit": [
                                769,
                                495
                            ]
                        }
                    ]
                },
                {
                    "fontSize": 12
                },
                {
                    "font": "fontname"
                },
                {
                    "text": [
                        "Caption here",
                        36,
                        550
                    ]
                }
            ]
        ]
    }

&nbsp;

### OSX Dependencies

	# libvips
	$ brew install homebrew/science/vips --with-imagemagick --with-webp

    # libvips from specific commit
    $ git clone git://github.com/jcupitt/libvips.git; cd libvips; git reset --hard <commit id>; gtkdocize; ./bootstrap.sh; cd ../; rm -Rf libvips;

    # ffmpeg
    $ brew install libvpx ffmpeg --with-nonfree --with-tools --with-freetype --with-libass --with-libvorbis --with-libvpx --with-libx264 --with-x265 --with-libmp3lame --with-libfdk-aac

### Usage (development)

You can add a `nodemon.json` file to your project to configure the public folder etc. This is useful if you're mounting a remote directory for example.

    // nodemon.json
    {
        "watch": ["routes", "lib"],
        "env": {
            "ACCESS_KEY_ID": "ACCESS_KEY_ID",
            "SECRET_ACCESS_KEY": "SECRET_ACCESS_KEY",
            "ENDPOINT": "ENDPOINT"
            "BUCKET": "BUCKET",
            "CDN": "CDN"
        }
    }

Use these steps to get up and running in development.

	# build docker image
	$ docker build -t homerjam/ace-assist .

    # or bypassing build cache
	$ docker build --no-cache -t homerjam/ace-assist .

	# stop/remove previous container if exists
	$ docker stop ace-assist; docker rm ace-assist

	# run container in interactive mode from image and bind ports, volumes
	$ docker run --name ace-assist -i \
        -p 49001:49001 \
        -v ~/assist/tmp:/app/tmp:rw \
        -v /tmp/acme:/tmp/acme:rw \
        -e "HTTP_PORT=49001" \
        -e "HTTPS_PORT=49002" \
        -e "ENVIRONMENT=development" \
        -e "SSL_DISABLED=true" \
        -e "EMAIL=email@domain.com" \
        -e "DOMAINS=example.com,example2.com" \
        -e "USERNAME=USERNAME" \
        -e "PASSWORD=PASSWORD" \
        -e "UV_THREADPOOL_SIZE=64" \
        -e "ACCESS_KEY_ID=ACCESS_KEY_ID" \
        -e "SECRET_ACCESS_KEY=SECRET_ACCESS_KEY" \
        -e "ENDPOINT=ENDPOINT" \
        -e "BUCKET=BUCKET" \
        -e "CDN=CDN" \
        homerjam/ace-assist

    # run container in interactive mode from image and bind ports, volumes - using .env file
	$ source .env; docker run --name ace-assist -i \
        -p 49001:49001 \
        --env-file=.env \
        -v ~/assist/tmp:/app/tmp:rw \
        -v /tmp/acme:/tmp/acme:rw \
        homerjam/ace-assist

	# test in browser
	http://localhost:49001

### Usage (production)

Note: Increase the `UV_THREADPOOL_SIZE` to improve file read performance, the default is 4.

	# run container in daemon mode from image and bind ports, volumes with environment variables
	$ docker run --name ace-assist -d -p 80:HTTP_PORT -p 443:HTTPS_PORT \
        -v /var/assist/tmp:/app/tmp:rw \
        -v /tmp/acme:/tmp/acme:rw \
        -e "HTTP_PORT=49001" \
        -e "HTTPS_PORT=49002" \
        -e "ENVIRONMENT=production" \
        -e "SSL_DISABLED=false" \
        -e "EMAIL=email@domain.com" \
        -e "DOMAINS=example.com,example2.com" \
        -e "USERNAME=USERNAME" \
        -e "PASSWORD=PASSWORD" \
        -e "UV_THREADPOOL_SIZE=64" \
        -e "ACCESS_KEY_ID=ACCESS_KEY_ID" \
        -e "SECRET_ACCESS_KEY=SECRET_ACCESS_KEY" \
        -e "ENDPOINT=ENDPOINT" \
        -e "BUCKET=BUCKET" \
        -e "CDN=CDN" \
        homerjam/ace-assist

    # using .env file
	$ source .env; docker run --name ace-assist -d \
        -p 80:$HTTP_PORT -p 443:$HTTPS_PORT \
        --env-file=.env \
        -v /var/assist/tmp:/app/tmp:rw \
        -v /tmp/acme:/tmp/acme:rw \
        homerjam/ace-assist

### Environment variables

    HTTP_PORT
    HTTPS_PORT
    ENVIRONMENT
    SSL_DISABLED
    EMAIL
    DOMAINS
	USERNAME
	PASSWORD
    UV_THREADPOOL_SIZE
    ACCESS_KEY_ID
    SECRET_ACCESS_KEY
    ENDPOINT
    BUCKET
    CDN

### Useful commands

	# Show free space
	$ df -h

	# Show largest directories
	$ du -Sh | sort -rh | head -n 15

	# Remove dangling images
	$ docker rmi $(docker images -q -f dangling=true)

	# Remove untagged images
	$ docker rmi -f $(docker images | grep "<none>" | awk "{print \$3}")

    # Resize partition to fill a resized volume on Digital Ocean (replace volume id)
    $ sudo resize2fs /dev/disk/by-id/scsi-0DO_Volume_volume-fra1-01

    # Add key to remote host to use ssh without a password
    $ ssh-copy-id -i ~/.ssh/id_rsa.pub user@remotehost

    # Backup using rsync
    $ rsync --recursive --compress --times --checksum --human-readable --rsh=ssh --verbose user@remotehost:/mnt/vol1/ /Volumes/vol1/backup

    # Mount remote folder locally (requires sshfs/osxfuse)
    $ sshfs user@remotehost:/mnt/vol1 ~/mnt/assist -ovolname=ASSIST

### Backup Script

    #!/bin/bash

    # Add key to remote host to use ssh without a password
    # $ ssh-keygen
    # brew install ssh-copy-id
    # $ ssh-copy-id -i ~/.ssh/id_rsa.pub user@remotehost

    # rsync -rztche ssh root@remotehost:/shared /Volumes/HD/backup

    rsync --recursive --compress --times --checksum --human-readable --rsh=ssh --verbose root@remotehost:/shared /Volumes/HD/backup
