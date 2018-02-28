const assert = require('reassert');
const assert_internal = assert;
const assert_usage = assert;
const log = require('reassert/log');
const {IsoBuilder} = require('@rebuild/iso');
//const log_title = require('@rebuild/build/utils/log_title');
//const dir = require('node-dir');
const path_module = require('path');
const fs = require('fs');
const {processReframeConfig} = require('@reframe/utils/processReframeConfig');

const Repage = require('@repage/core');
const {getStaticPages} = require('@repage/build');

module.exports = build;

const SOURCE_DIR = 'source'+path_module.sep;
const BROWSER_DIST_DIR = 'browser'+path_module.sep;

function build({
    pagesDirPath,

    onBuild: onBuild_user,

    reframeConfig={},

    doNotAutoReload=isProduction(),
    appDirPath,
    log: log_option,
    ...rebuild_opts
}) {
    assert_usage(
        !pagesDirPath || pagesDirPath.constructor===String && pagesDirPath.startsWith('/'),
        pagesDirPath
    );

    processReframeConfig(reframeConfig);

    assert_usage(
        pagesDirPath || reframeConfig._processed.webpackBrowserConfigModifier && reframeConfig._processed.webpackServerConfigModifier,
        "Provide either argument `pagesDirPath` or provide `webpackBrowserConfig` and `webpackServerConfig` in `reframe.config.js`."
    );

    const isoBuilder = new IsoBuilder();

    isoBuilder.log = log_option;
    isoBuilder.appDirPath = appDirPath;
    isoBuilder.webpackBrowserConfigModifier = reframeConfig._processed.webpackBrowserConfigModifier;
    isoBuilder.webpackServerConfigModifier = reframeConfig._processed.webpackServerConfigModifier;

    isoBuilder.builder = async there_is_a_newer_run => {
        const {fileWriter} = isoBuilder;
        const {serverEntry} = reframeConfig._processed;

        const pages = {};
        const server_entries = get_server_entries({pagesDirPath, serverEntry, reframeConfig});

        await isoBuilder.build_server(server_entries);
        if( there_is_a_newer_run() ) return;

        var {buildState} = isoBuilder;
        const browser_entries = get_browser_entries({pagesDirPath, buildState, fileWriter, reframeConfig});

        await isoBuilder.build_browser(browser_entries);
        if( there_is_a_newer_run() ) return;

        const build_info = extract_build_info(isoBuilder.buildState, reframeConfig);

        var {buildState} = isoBuilder;
        await writeHtmlFiles({pages: build_info.pages, buildState, fileWriter, reframeConfig});
        if( there_is_a_newer_run() ) return;

        if( onBuild_user ) {
            onBuild_user(build_info);
        }

        return build_info;
    };

    /*
    addFileChangeListener(() => {
        isoBuilder.build();
    });
    */

    return isoBuilder.build();
}

function get_server_entries({pagesDirPath, reframeConfig}) {
    const server_entries = {};

    get_page_files({pagesDirPath, reframeConfig})
    .forEach(({file_path, file_name, entry_name, is_universal, is_dom, is_entry, is_html}) => {
        if( is_universal || is_html ) {
            server_entries[entry_name] = [file_path];
        }
    });

    assert_usage(
        Object.values(server_entries).length>0,
        "No page config found at `"+pagesDirPath+"`."
    );

    return server_entries;
}

function get_browser_entries({pagesDirPath, buildState, fileWriter, reframeConfig}) {
    const browser_entries = {};

    fileWriter.startWriteSession('browser_source_files');

    const reframe_browser_conifg__path = generate_reframe_browser_config({fileWriter, reframeConfig});

 // let autoreload_entry;

    get_page_files({pagesDirPath, reframeConfig})
    .forEach(({file_path, file_name, entry_name, is_universal, is_dom, is_entry, is_html}) => {
        if( is_universal || is_dom ) {
            const file_name__dist = file_name.split('.').slice(0, -2).concat(['entry', 'js']).join('.');
            const entry_file_path = generate_browser_entry({fileWriter, file_path, file_name__dist, reframe_browser_conifg__path});
            const entry_name__browser = entry_name.split('.').slice(0, -1).concat(['entry']).join('.');
            browser_entries[entry_name__browser] = [entry_file_path];
            return;
        }
        if( is_entry ) {
            browser_entries[entry_name] = [file_path];
            return;
        }
        /*
        if( ! autoreload_entry ) {
        }
        */
     // browser_entries[entry_name] = [];
    });

    /*
    if( Object.values(browser_entries).length === 0 ) {
        const entry_name = 'dummy-entry';
        const noop_file_path = generate_browser_noop_entry({fileWriter});
        browser_entries[entry_name] = [noop_file_path];
    }
    */

    assert_internal(Object.values(browser_entries).length>0);

    fileWriter.endWriteSession();

    return browser_entries;
}

function get_page_files({pagesDirPath, reframeConfig}) {
    return (
        fs__ls(pagesDirPath)
        .map(file_path => {
            const file_name = path_module.basename(file_path);
            const entry_name = file_name.split('.').slice(0, -1).join('.');

            const is_universal = is_script(file_path, '.universal', reframeConfig);
            const is_dom = is_script(file_path, '.dom', reframeConfig);
            const is_entry = is_script(file_path, '.entry', reframeConfig);
            const is_html = is_script(file_path, '.html', reframeConfig);
            assert_internal(is_universal + is_dom + is_entry + is_html <= 1, file_path);

            return {file_path, file_name, entry_name, is_universal, is_dom, is_entry, is_html};
        })
    );
}

function generate_browser_noop_entry({fileWriter}) {
    const source_code = [
        '// No-op JavaScript that only includes the client-side autoreload script',
     // "require('"+uhew+"');",
    ].join('\n');
    const fileAbsolutePath = fileWriter.writeFile({
        fileContent: source_code,
        filePath: SOURCE_DIR+'__noop_autoreload.entry.js',
    });
    return fileAbsolutePath;
}

function generate_reframe_browser_config({fileWriter, reframeConfig}) {
    const source_code = [
        "const reframeBrowserConfig = {};",
        "reframeBrowserConfig.plugins = [",
        ...(
            reframeConfig._processed.browserConfigs.map(({diskPath}) => {
                assert_internal(path_module.isAbsolute(diskPath), diskPath);
                assert_internal(path_points_to_a_file(diskPath), diskPath);
                return "  require('"+diskPath+"')(),";
            })
        ),
        "];",
        "",
        "module.exports = reframeBrowserConfig;",
    ].join('\n')

    const filePath = SOURCE_DIR+'reframe.browser.config.js';

    const fileAbsolutePath = fileWriter.writeFile({
        fileContent: source_code,
        filePath,
    });

    return fileAbsolutePath;
}

function generate_browser_entry({file_path, file_name__dist, fileWriter, reframe_browser_conifg__path}) {
    assert_internal(path_module.isAbsolute(file_path));
    assert_internal(path_module.isAbsolute(reframe_browser_conifg__path));
    assert_internal(!path_module.isAbsolute(file_name__dist));
    const source_code = (
        [
            "const hydratePage = require('"+require.resolve('@reframe/browser/hydratePage')+"');",
            "const reframeBrowserConfig = require('"+reframe_browser_conifg__path+"');",
            "",
            "// hybrid cjs and ES6 module import",
            "let pageConfig = require('"+file_path+"');",
            "pageConfig = Object.keys(pageConfig).length===1 && pageConfig.default || pageConfig;",
            "",
            "hydratePage(pageConfig, reframeBrowserConfig);",
        ].join('\n')
    );
    const fileAbsolutePath = fileWriter.writeFile({
        fileContent: source_code,
        filePath: SOURCE_DIR+file_name__dist,
    });
    return fileAbsolutePath;
}

function extract_build_info(buildState, reframeConfig) {
    const {HapiPluginStaticAssets, output} = buildState.browser;
    assert_internal(HapiPluginStaticAssets);
    const {dist_root_directory: browserDistPath} = output;
    assert_internal(browserDistPath, output);

    const pages = get_pages({buildState, reframeConfig});

    return {pages, HapiPluginStaticAssets, browserDistPath};
}

async function writeHtmlFiles({pages, buildState, fileWriter, reframeConfig}) {
    fileWriter.startWriteSession('html_files');

    (await get_static_pages_info())
    .forEach(async ({url, html}) => {
        assert_input({url, html});
        fileWriter.writeFile({
            fileContent: html,
            filePath: get_file_path(url),
        });
    });

    fileWriter.endWriteSession();

    return;

    function get_static_pages_info() {
        const repage = new Repage();

        repage.addPlugins([
            ...reframeConfig._processed.repage_plugins,
        ]);

        repage.addPages(pages);

        return getStaticPages(repage);
    }

    function get_file_path(url) {
        const {pathname} = url;
        assert_internal(pathname.startsWith('/'));
        const file_path__relative = (pathname === '/' ? 'index' : pathname.slice(1))+'.html'
        const file_path = (
            (BROWSER_DIST_DIR+file_path__relative)
            .replace(/\//g, path_module.sep)
        );
        return file_path;
    }

    function assert_input({url, html}) {
        assert_internal(html===null || html && html.constructor===String, html);
        assert_internal(html);

        assert_internal(url.pathname.startsWith('/'));
        assert_internal(url.search==='');
        assert_internal(url.hash==='');
    }
}

function get_pages({buildState, reframeConfig}) {
    const args_browser = {output: buildState.browser.output};
    const args_server = {output: buildState.server.output};
    return get_page_infos({args_browser, args_server, reframeConfig});
    /*
    const server_entries__compiled = buildState.server.entries;
    server_entries__compiled.forEach(({distPath}) => {
        
    });
    */
}

function get_page_infos({args_browser, args_server, reframeConfig}) {
    const page_infos = load_page_infos({args_server}, reframeConfig);
    add_browser_files({page_infos, args_browser, reframeConfig});
    return page_infos;
}

function add_browser_files({page_infos, args_browser: {output}, reframeConfig}) {
    page_infos.forEach(page_info => {
        assert_internal(page_info.sourcePath.startsWith('/'), page_info, page_info.sourcePath);
        add_disk_path(page_info, output, reframeConfig);
        add_same_named_entries(page_info, output, reframeConfig);
    });
}

function add_same_named_entries(page_info, output, reframeConfig) {
    const filepath = page_info.sourcePath;
    if( ! is_script(filepath, '.universal', reframeConfig) && ! is_script(filepath, '.html', reframeConfig) ) {
        return;
    }
    const pagename = path_module.basename(filepath).split('.').slice(0, -2).join('.');

    Object.values(output.entry_points)
    .forEach(entry_point => {
        const is_match = (
            entry_point.source_entry_points
            .some(source_entry => {
                const source_filename = path_module.basename(source_entry);
                return (
                    is_script(source_filename, '.entry', reframeConfig) &&
                    source_filename.split('.').includes(pagename)
                );
            })
        );
        if( ! is_match ) {
            return;
        }

        assert_internal(entry_point.scripts.length>=1, entry_point);
        page_info.scripts = make_paths_array_unique([
            ...(page_info.scripts||[]),
            ...entry_point.scripts
        ]);

        assert_internal(entry_point.styles.length>=0, entry_point);
        page_info.styles = make_paths_array_unique([
            ...(page_info.styles||[]),
            ...entry_point.styles
        ]);
    });
}

function add_disk_path(page_info, output, reframeConfig) {
    (page_info.scripts||[])
    .forEach((script_spec, i) => {
        if( ! (script_spec||{}).diskPath ) {
            return;
        }
        const disk_path__relative = script_spec.diskPath;
        assert_usage((disk_path__relative||{}).constructor===String, disk_path__relative);
        assert_internal(!disk_path__relative.startsWith('/'), disk_path__relative);
        const source_path_parent = path_module.dirname(page_info.sourcePath);
        assert_internal(source_path_parent.startsWith('/'));
        const disk_path = path_module.resolve(source_path_parent, disk_path__relative);
        const dist_files = find_dist_files({disk_path, output, reframeConfig});
        assert_usage(
            dist_files!==null,
            output,
            page_info,
            "Couldn't find build information for `"+disk_path+"`.",
            "Is `"+disk_path__relative+"` an entry point in the browser webpack configuration?",
        );
        /*
        assert_usage(
            script_spec.diskPath.constructor === String && is_script(script_spec.diskPath, '.entry', reframeConfig),
            script_spec.diskPath
        );
        */
        const {scripts, styles} = dist_files;
        assert_internal(scripts.constructor===Array);
        assert_internal(styles.constructor===Array);
        page_info.scripts = make_paths_array_unique([
            ...page_info.scripts.slice(0, i),
            ...scripts,
            ...page_info.scripts.slice(i+1),
        ]);
        page_info.styles = make_paths_array_unique([
            ...(page_info.styles||[]),
            ...styles,
        ]);
    });
}

function make_paths_array_unique(paths) {
    assert_internal(
        paths.every(
            path => (
                path && path.constructor===Object ||
                path && path.constructor===String && path.startsWith('/')
            )
        ),
        paths
    );
    return [...new Set(paths)];
}

function find_dist_files({disk_path, output, reframeConfig}) {
    let entry_point;
    Object.values(output.entry_points)
    .forEach(ep => {
        const source_path = get_source_path(ep, path => is_script(path, '.entry', reframeConfig));
        assert_internal(is_script(source_path, '.entry', reframeConfig), output, ep, source_path);
        assert_internal(source_path.startsWith('/'));
        assert_internal(disk_path.startsWith('/'));
        if( source_path === disk_path ) {
            entry_point = ep;
        }
    });
    if( entry_point===undefined ) {
        return null;
    }
    assert_internal(entry_point, output, disk_path);
    assert_internal(entry_point.scripts.length>=1, entry_point);
    const {scripts, styles} = entry_point;
    return {scripts, styles};
}

function load_page_infos({args_server}, reframeConfig) {
    require('source-map-support').install();
    const page_infos = (
        Object.values(args_server.output.entry_points)
        .map(entry_point => {
            const modulePath = get_nodejs_path(entry_point, reframeConfig);
            const page_info = require__magic(modulePath);
            page_info.sourcePath = get_source_path(entry_point);
            assert_internal(
                page_info.sourcePath.startsWith('/'),
                args_server.output.entry_points,
                page_info.sourcePath
            );
            assert_usage(
                page_info.route || page_info.pageLodaer,
                page_info,
                "The page object printed above at `"+page_info.sourcePath+"` is missing the `route` property."
            );
            return page_info;
        })
    );
    return page_infos;
}

function require__magic(modulePath) {
    delete require.cache[modulePath];
    const module_exports = require(modulePath);
    if( module_exports.__esModule === true ) {
        return module_exports.default;
    }
    return module_exports;
}

function get_nodejs_path(entry_point, reframeConfig) {
    const scripts = (
        entry_point.all_assets.filter(asset => is_script(asset.filename, '', reframeConfig))
    );
    assert_internal(scripts.length===1, entry_point);
    const {filepath} = scripts[0];
    assert_internal(filepath, entry_point);
    assert_internal(filepath.constructor===String);
    return filepath;
}
function get_source_path(entry_point, filter) {
    let {source_entry_points} = entry_point;
    assert_internal(source_entry_points.length>=1, entry_point);
    if( filter ) {
        source_entry_points = source_entry_points.filter(filter);
    }
    assert_internal(source_entry_points.length===1, entry_point);
    const source_path = source_entry_points[0];
    assert_internal(source_path.constructor===String);
    return source_path;
}

function isProduction() {
    return process.env['NODE_ENV'] === 'production';
}

function is_abs(path) {
    return path_module.isAbsolute(path);
}

function path__resolve(path1, path2, ...paths) {
    assert_internal(path1 && is_abs(path1), path1);
    assert_internal(path2);
    return path_module.resolve(path1, path2, ...paths);
}

function is_script(path, suffix, reframeConfig) {
    assert_internal(reframeConfig._processed.pageExtensions.constructor===Array);
    const extensions = (
        [
            ...reframeConfig._processed.pageExtensions,
            ...['js', 'jsx'],
        ]
    );
    return (
        extensions
        .some(ext => path.endsWith(suffix+'.'+ext))
    );
}

function path_points_to_a_file(file_path) {
    try {
        // `require.resolve` throws if `file_path` is not a file
        require.resolve(file_path);
        return true;
    } catch(e) {}
    return false;
}

function fs__ls(dirpath) {
    assert_internal(is_abs(dirpath));
    /*
    const files = dir.files(dirpath, {sync: true, recursive: false});
    */
    const files = (
        fs.readdirSync(dirpath)
        .map(filename => path__resolve(dirpath, filename))
    );
    files.forEach(filepath => {
        assert_internal(is_abs(filepath), dirpath, files);
        assert_internal(path_module.relative(dirpath, filepath).split(path_module.sep).length===1, dirpath, files);
    });
    return files;
}
