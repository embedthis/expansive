Expansive.load({
    meta: {
        title:       'Embedthis Expansive Documentation',
        url:         'https://embedthis.com/esp/doc/',
        description: 'A fast, powerful web site generator',
        keywords:    'expansive, static site generator, web site generator, docpad',
    },
    expansive: {
        copy: [ 'images' ],
        dependencies: { 'css/all.css.less': 'css/*.inc.less' },
        documents: [ '**', '!css/*.inc.less' ],
        plugins: [ 'less' ],
    }
})
