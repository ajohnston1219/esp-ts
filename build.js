import microbundle from 'microbundle';
import { generate } from 'ts-to-zod/lib/core/generate.js';
import fs from 'fs';
import path from 'path';

const getAllFiles = async (dirPath, arrayOfFiles) => new Promise((resolve, reject) => {
    arrayOfFiles = arrayOfFiles || [];
    fs.readdir(dirPath, async (err, files) => {
        if (err) throw err;
        await Promise.all(files.map(async (file) => {
            if (fs.statSync(dirPath + '/' + file).isDirectory()) {
                arrayOfFiles = await getAllFiles(dirPath + '/' + file, arrayOfFiles);
            } else {
                arrayOfFiles.push(path.join(path.dirname('.'), dirPath, '/', file));
            }
        }));
        resolve(arrayOfFiles);
    });
});

(async function() {
    console.log('Generating Schemas...')
    const allFiles = await getAllFiles('./src', []);
    const fileRegex = /^.*\.schema\.ts$/;
    const schemaFiles = allFiles.filter(file => fileRegex.test(file));
    console.log('schemas found:', schemaFiles);
    const schemaDir = path.join(path.dirname('.'), 'src', 'schemas');
    const newDir = fs.mkdirSync(schemaDir);
    console.log('new dir', newDir);
    await Promise.all(schemaFiles.map(async (file) => new Promise((resolve, reject) => {
        fs.readFile(file, (err, data) => {
            if (err) {
                reject(err);
                return;
            }
            const sourceText = data.toString('utf-8');
            const result = generate({ sourceText });
            const generatedFile = result.getZodSchemasFile();
            console.log('result', generatedFile);
            fs.writeFile(path.join(schemaDir, path.basename(file)), generatedFile, (err) => {
                if (err) {
                    reject(err);
                    return;
                }
                resolve();
            });
        });
    })));
    console.log('Building...');
    await microbundle({
        cwd: '.',
        target: 'node',
        format: 'es',
    });
})();