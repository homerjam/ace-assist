const _ = require('lodash');
const Promise = require('bluebird');
const fs = Promise.promisifyAll(require('fs'));
const mime = require('mime');
const S3Client = require('aws-sdk/clients/s3');

module.exports = class S3 {
  constructor(accessKeyId, secretAccessKey, bucket) {
    this.s3 = new S3Client({
      accessKeyId,
      secretAccessKey,
    });

    this.bucket = bucket;
  }

  async upload(file, key) {
    const stats = await fs.statAsync(file);

    const fileSize = stats.size;
    const mimeType = mime.getType(file);

    const uploadOptions = {
      Bucket: this.bucket,
      Key: key,
      Body: fs.createReadStream(file),
      ACL: 'public-read',
      StorageClass: 'REDUCED_REDUNDANCY',
      Metadata: {},
      Expires: new Date('2099-01-01'),
      CacheControl: 'max-age=31536000',
      ContentType: mimeType,
      ContentLength: fileSize,
    };

    const upload = this.s3.upload(uploadOptions);

    // upload.on('httpUploadProgress', (event) => {
    //   // console.log(event);
    // });

    await upload.promise();

    return {
      uploadOptions,
      bucket: this.bucket,
      key,
      mimeType,
      fileSize,
    };
  }

  async delete(prefixes) {
    if (prefixes.length === 0) {
      return [];
    }

    const promises = [];

    prefixes.forEach((Prefix) => {
      promises.push(this.s3.listObjects({
        Bucket: this.bucket,
        Prefix,
      }).promise());
    });

    const results = await Promise.all(promises);

    const Objects = [];

    results.forEach(({ Contents }) => {
      Contents.forEach(({ Key }) => {
        Objects.push({
          Key,
        });
      });
    });

    if (!Objects.length) {
      return [];
    }

    const chunks = _.chunk(Objects, 1000);

    const result = await Promise.all(chunks.map(Objects => this.s3.deleteObjects({
      Bucket: this.bucket,
      Delete: {
        Objects,
      },
    }).promise()));

    return result;
  }

  getSignedUrl(key, fileName) {
    return this.s3.getSignedUrl('getObject', {
      Bucket: this.bucket,
      Key: key,
      ResponseContentDisposition: `attachment; filename="${fileName}"`,
    }).promise();
  }

  getObject(key) {
    return this.s3.getObject({
      Bucket: this.bucket,
      Key: key,
    }).promise();
  }

};
