const AV = require('../lib/av');

const run = async (filePath, hashKey, settings) => {
  await AV.transform(filePath, settings, hashKey);
};

console.time('transform');

console.log(process.argv);
console.log(JSON.parse(process.argv[4]));

run(process.argv[2], process.argv[3], JSON.parse(process.argv[4]));

console.timeEnd('transform');
