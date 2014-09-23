
Expansive.init({
    meta: {
        title: "Home page title",
        url: "https://embedthis.com",
        description: "Meta data description (optional)",
        keywords: "Meta data keywords (optional)",
    },
    expansive: {
        collections: {},
        copy:    [ 'images' ],
        dependencies: { 'css/all.css.less': 'css/*.inc.less' },
        directories: {
            documents: Path('documents'),
            layouts:   Path('layouts'),
            partials:  Path('partials'),
            public:    Path('public'),
        },
        documents: [ '**', '!css/*.inc.less' ],
        files: [],
        mode:    'debug',
        plugins: [ 'bash', 'less', 'css', 'js', 'marked', 'test', 'gzip', 'uglifyjs' ],
        routes: [],
        script: `
            /* Detect changes to *.less and then touch all.css.less */
            function onchange(file, meta) {
                let path = Path('documents/css/all.css.less')
                if (file.extension == 'less' && file != path) {
                    touch(path)
                }
            }

            /* If app.less and theme.less are being excluded - then manually check if they have been modified */
            function check(mark) {
                for each (file in ['app.less', 'theme.less']) {
                    if (Path('documents/css').join(file).modified >= mark) {
                        let path = Path('documents/css/all.css.less')
                        vtrace('Touch', path)
                        touch(path)
                        break
                    }
                }
            }
        `,
        services: {
        },
        sitemap: { files: '**.html' },
        transforms: {
        },
        watch: 1234,
    },
    debug: {
        services: {
            compress: {
                enable: false,
                include: [ '**.html' ],
            },
            'minify-js': {
                compress: true,
                mangle: true,
                dotmin: true,
            },
            'prefix-css': {
                enable: true,
            },
            'minify-css': {
                enable: true,
            }
        }
    }
})
