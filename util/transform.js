const AV = require('../src/lib/av');

const run = async (filePath, hashKey, settings) => {
  console.time('transform');
  await (await AV.transform(filePath, settings, hashKey)).promise;
  console.timeEnd('transform');
};

run(process.argv[2], process.argv[3], JSON.parse(process.argv[4]));
