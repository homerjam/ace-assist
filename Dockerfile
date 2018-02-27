FROM ubuntu:16.04

RUN apt-get update; apt-get upgrade -y; apt-get clean

# Install deps
RUN apt-get update && apt-get install -y --fix-missing build-essential pkg-config sudo wget curl supervisor

# Install logentries agent
# RUN apt-get update && apt-get install -y python-setuptools
# RUN wget https://raw.github.com/logentries/le/master/install/linux/logentries_install.sh && sudo bash logentries_install.sh

# Add nodesource PPA for specific version of node and install
RUN curl -sL https://deb.nodesource.com/setup_8.x | bash -
RUN apt-get update && apt-get install -y nodejs

# Add supervisor configuration
RUN mkdir -p /var/log/supervisor
ADD scripts/supervisord.conf /etc/supervisor/conf.d/supervisord.conf

# Create app directory and change working directory into it
RUN mkdir -p /app
WORKDIR /app

# Copy package.json separately to cache npm install
COPY package.json /app/

# Install app dependencies
RUN npm install --unsafe-perm

# Copy files to app directory
COPY . /app

# Make logentries script executable
RUN chmod +x /app/scripts/logentries.sh

# Expose port for express app
EXPOSE 49001

# Boot with supervisor
CMD ["/usr/bin/supervisord"]
