/*
    explode generate                # generate entire site
    explode run                     # watches for changes and serve
    explode [--out dir] paths       # process one file
    explode path                    # process one file to stdout

    - Need live reload capability (web sockets)


    start.me
    package.json        
        directories: {
            layouts:
            partials:
            files:
            documents:
            output:
        }
    explode.json                    # included from package.json (inline to begin with)
    out/
    src/
        documents/
        files/
        layouts/
        partials/

    Steps
        readConfig()
        for each (file in Path('.').files(*)) {
            for each (extension transition) {
                if (not skipFile) {
                    renderFile()
                }
            }
        }

        function renderFile(meta, path) {
            pathMeta = extractMeta(path)
            meta = blend(meta, pathMeta)
            let data = expandLayout(path, meta.layout)
            data = expandPartials(data)

            for each ext in path {
                data = transform(ext)
            }
        }

    NOTES:
    - Need plugin architecture
        - Need markdown
        - Need code highlighting

    explode.json: {
        site: {
            url: ''
            title: ''
            description: ''
            keywords: ''
            links: ''
        },
        plugins: {
        }
        //   No functions in here. Use plugins to add functions or?
        blend: ['file.es']
    }

    - Use ${ }$, or {% %} or {$ $} for inline ejscript
    - file.html.ejs
 */
