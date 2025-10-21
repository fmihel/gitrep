/* eslint-disable array-callback-return */
const path = require('path');
const fs = require('fs');
const PluginClass = require('../PluginClass.js');
const dir = require('../dir');

const PSR4_OBJECT = '<%PSR4_OBJECT%>';
const PHP_AUTOLOAD_TEMPLATE = `<?php

spl_autoload_register(function ($class) {

    $psr4 = <%PSR4_OBJECT%>;

    foreach ($psr4 as $key => $paths) {
        foreach ($paths as $path) {
            $module = false;
            $search = strpos($class, $key);

            if ($search === 0) {
                $local_class_path = substr($class, strlen($key));
                if (!$local_class_path) {
                    $exp = explode('\\\\', $key);
                    $local_class_path = $exp[count($exp) - 1];
                }
                $module = implode('/', [__DIR__, $path, $local_class_path . '.php']);
                $module = str_replace(['//', '\\/'], ['/', '\\\\'], $module);
                if (strpos($module, ':\\\\') === false) {
                    $module = str_replace('\\\\', '/', $module);
                }

            }

            if ($module && file_exists($module)) {
                include $module;
                return;
            }
        }
    }
        
});
`;

class PhpAutoloadPsr4 extends PluginClass {
    constructor(params, config) {
        super(params, config);
        this.params = {
            filename: path.resolve(path.join(config.dest, 'autoload.php')),
            psr4: {

            },
            ...this.params,
        };
    }

    async action(event, config) {
        if (event === 'done') {
            await this.createAutoload(config);
        }
    }

    async createAutoload(config) {
        const t = this;
        const psr4 = {};/// / psr4 = {namespace1:[path1,path2,..],namespace2:[...],...}

        Object.keys(t.params.psr4).map((namespace) => {
            psr4[namespace.replaceAll('\\', '\\\\')] = t.params.psr4[namespace];
        });

        dir.each(config.dest, (it) => {
            if (!it.isDir && it.short === 'composer.json') {
                const json = t.loadJson(it.path);
                const autoload = t.getAutoloadPsr4(json);

                if (autoload) {
                    const add = t.getPsr4(autoload, config, path.dirname(it.path));
                    Object.keys(add).map((n) => {
                        const namespace = n.replaceAll('\\', '\\\\');
                        if (!(namespace in psr4)) {
                            psr4[namespace] = [];
                        }
                        psr4[namespace].push(add[n]);
                    });
                    // console.log(t.getPsr4(autoload, config, it.path));
                    // psr4 = { ...psr4, ...t.getPsr4(autoload, config, it.path) };
                }
            }
        });

        fs.writeFileSync(
            this.params.filename,
            PHP_AUTOLOAD_TEMPLATE.replace(
                PSR4_OBJECT,
                `[${
                    Object.keys(psr4).reduce((a, b) => {
                        const val = `"${b}"=>[${psr4[b].reduce((c, d) => {
                            const mean = `"${d}"`;
                            return !c ? mean : `${c},${mean}`;
                        }, '')}]`;
                        return !a ? val : `${a},\n\t\t\t${val}`;
                    }, '')}]`,
            ),
        );
    }

    loadJson(filename) {
        const configJSON = fs.readFileSync(filename);
        return JSON.parse(configJSON);
    }

    getAutoloadPsr4(json) {
        return (('autoload' in json) && ('psr-4' in json.autoload)) ? json.autoload['psr-4'] : false;
    }

    getPsr4(autoload, config, projectPath) {
        const out = {};

        const project = path.resolve(projectPath).replace(path.resolve(config.dest), '');
        Object.keys(autoload).map((namespace) => {
            const localPath = autoload[namespace];
            // console.log(path.join(project, localPath));
            out[namespace] = `${path.join(project, localPath).replaceAll('\\', '/')}`;
        });
        return out;
    }
}

module.exports = PhpAutoloadPsr4;
