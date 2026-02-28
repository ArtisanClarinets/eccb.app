import { deepCloneJSON } from './src/lib/json';

const data = {
  id: 1,
  name: "Test",
  date: new Date(),
  nested: {
    array: [1, undefined, 3, null, 5],
    obj: {
      a: 1,
      b: undefined,
      c: {
        d: 4,
        f: function() {}
      }
    }
  },
  largeString: "a".repeat(100)
};

const iterations = 100000;

console.time('JSON.parse/stringify');
for (let i = 0; i < iterations; i++) {
  JSON.parse(JSON.stringify(data));
}
console.timeEnd('JSON.parse/stringify');

console.time('deepCloneJSON');
for (let i = 0; i < iterations; i++) {
  deepCloneJSON(data);
}
console.timeEnd('deepCloneJSON');

console.log(JSON.stringify(JSON.parse(JSON.stringify(data))) === JSON.stringify(deepCloneJSON(data)));
