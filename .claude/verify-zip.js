// ZIP central directory 를 직접 파싱해 엔트리명·CRC·크기를 확인
const fs = require('fs'), zlib = require('zlib'), path = require('path');
const buf = fs.readFileSync(path.join(__dirname, '..', 'daangn-my-src.zip'));

// EOCD 찾기
let eo = -1;
for (let i = buf.length - 22; i >= 0; i--) if (buf.readUInt32LE(i) === 0x06054b50) { eo = i; break; }
const total = buf.readUInt16LE(eo + 10);
let off = buf.readUInt32LE(eo + 16);

console.log('entries in central directory:', total);
console.log('');
let bad = 0;
for (let k = 0; k < total; k++) {
  if (buf.readUInt32LE(off) !== 0x02014b50) throw new Error('bad CD sig at ' + off);
  const nLen  = buf.readUInt16LE(off + 28);
  const eLen  = buf.readUInt16LE(off + 30);
  const cLen  = buf.readUInt16LE(off + 32);
  const crc   = buf.readUInt32LE(off + 16);
  const cSize = buf.readUInt32LE(off + 20);
  const uSize = buf.readUInt32LE(off + 24);
  const method= buf.readUInt16LE(off + 10);
  const lho   = buf.readUInt32LE(off + 42);
  const name  = buf.slice(off + 46, off + 46 + nLen).toString('utf8');

  // local header -> 압축 데이터 추출 후 실제 파일과 대조
  const lnLen = buf.readUInt16LE(lho + 26);
  const leLen = buf.readUInt16LE(lho + 28);
  const dStart = lho + 30 + lnLen + leLen;
  const raw = buf.slice(dStart, dStart + cSize);
  const data = method === 8 ? zlib.inflateRawSync(raw) : raw;

  const disk = fs.readFileSync(path.join(__dirname, '..', name));
  const match = disk.equals(data);
  const sepOk = !name.includes(String.fromCharCode(92));
  if (!match || !sepOk) bad++;
  console.log(
    (match ? 'OK  ' : 'FAIL') + ' ' +
    (sepOk ? 'fwd' : 'BAK') + '  ' +
    name.padEnd(48) + String(uSize).padStart(8) + ' -> ' + String(cSize).padStart(7) +
    '  crc=' + crc.toString(16).padStart(8, '0')
  );
  off += 46 + nLen + eLen + cLen;
}
console.log('');
console.log(bad === 0
  ? 'ALL VERIFIED: forward-slash paths, contents byte-identical to src/'
  : bad + ' PROBLEM(S) FOUND');
