FROM ubuntu:18.04

ENV HTTP_PORT=80
ENV HTTPS_PORT=443
ENV ENVIRONMENT=production
ENV SSL_DISABLED=false
ENV EMAIL=
ENV DOMAINS=
ENV USERNAME=
ENV PASSWORD=
ENV UV_THREADPOOL_SIZE=4
ENV ACCESS_KEY_ID=
ENV SECRET_ACCESS_KEY=
ENV ENDPOINT=s3.amazonaws.com
ENV BUCKET=
ENV CDN=
ENV NODE_VERSION=12
ENV FFMPEG_VERSION=4.1.3

RUN apt-get update; apt-get upgrade -y; apt-get clean

# Install common dependencies
RUN apt-get update && apt-get install -y --fix-missing autoconf automake build-essential cmake pkg-config software-properties-common texinfo sudo wget curl git supervisor

# Install nodejs
RUN curl -sL https://deb.nodesource.com/setup_${NODE_VERSION}.x | bash -
RUN apt-get update && apt-get install -y nodejs

# Install handbrake-cli
RUN add-apt-repository --yes ppa:stebbins/handbrake-releases && apt-get update -qq && apt-get install -qq handbrake-cli

# Install ffmpeg
RUN add-apt-repository multiverse && apt-get update && apt-get install -y libass-dev libfreetype6-dev libsdl2-dev libtheora-dev libtool libva-dev libvdpau-dev libvorbis-dev libxcb1-dev libxcb-shm0-dev libxcb-xfixes0-dev zlib1g-dev libssl-dev libwebp-dev nasm yasm libx264-dev libx265-dev libvpx-dev libfdk-aac-dev libmp3lame-dev libopus-dev && \
  DIR=$(mktemp -d) && cd ${DIR} && \
  curl -s http://ffmpeg.org/releases/ffmpeg-${FFMPEG_VERSION}.tar.gz | tar zxvf - -C . && \
  cd ffmpeg-${FFMPEG_VERSION} && \
  ./configure \
  --enable-gpl --enable-libass --enable-libfdk-aac --enable-libfreetype --enable-libmp3lame --enable-libopus --enable-libtheora --enable-libvorbis --enable-libvpx --enable-libx264 --enable-libx265 --enable-nonfree --enable-libwebp --enable-postproc --enable-avresample --enable-libfreetype --enable-openssl --disable-debug && \
  make && make install && make distclean && \
  rm -rf ${DIR}

# Add supervisor configuration
RUN mkdir -p /var/log/supervisor
ADD conf/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Create app directory and change working directory into it
RUN mkdir -p /app
WORKDIR /app

# Copy package.json separately to cache npm install
COPY package.json /app/

# Install app dependencies
RUN npm install --unsafe-perm

# Copy files to app directory
COPY . /app

# Expose ports for express app
EXPOSE ${HTTP_PORT}
EXPOSE ${HTTPS_PORT}

# Boot with supervisor
CMD ["/usr/bin/supervisord"]

# Boot with npm
# CMD ["npm", "start"]
