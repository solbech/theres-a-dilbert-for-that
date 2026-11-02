// Checks archive paths in src/paths.js for macOS, Linux and Windows. Usage: node tools/check-paths.mjs
import assert from 'node:assert/strict';
import { cleanRoot, fileUrl, folderOf, joinPath } from '../src/paths.js';

const file = '2005/2005-01-09_upgrade computer #1.gif', encoded = '2005/2005-01-09_upgrade%20computer%20%231.gif';
const url = (root) => fileUrl(joinPath(cleanRoot(root), file));

assert.equal(url('/Volumes/Public/Dilbert/'), `file:///Volumes/Public/Dilbert/${encoded}`);
assert.equal(url('C:\\Dilbert'), `file:///C:/Dilbert/${encoded}`);
assert.equal(url('c:\\My Comics\\Dilbert\\'), `file:///c:/My%20Comics/Dilbert/${encoded}`);
assert.equal(url('C:/Dilbert/'), `file:///C:/Dilbert/${encoded}`);
assert.equal(url('D:\\'), `file:///D:/${encoded}`);
assert.equal(url('\\\\NAS\\Public\\Dilbert\\'), `file://NAS/Public/Dilbert/${encoded}`);

assert.equal(joinPath('/Volumes/Public/Dilbert', file), `/Volumes/Public/Dilbert/${file}`);
assert.equal(joinPath('C:\\Dilbert', file), 'C:\\Dilbert\\2005\\2005-01-09_upgrade computer #1.gif');
assert.equal(joinPath('/Users/a\\b', file), `/Users/a\\b/${file}`);

assert.equal(folderOf('', '/Volumes/Public/Dilbert/index.html'), '/Volumes/Public/Dilbert');
assert.equal(folderOf('', '/C:/My%20Comics/Dilbert/index.html'), 'C:\\My Comics\\Dilbert');
assert.equal(folderOf('nas', '/Public/Dilbert/index.html'), '\\\\nas\\Public\\Dilbert');
console.log('paths ok');
