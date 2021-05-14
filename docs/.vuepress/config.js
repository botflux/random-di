module.exports = {
    title: "Dependency injection container",
    description: "Manage your application dependencies",
    base: "/dependency-injection-container/",
    themeConfig: {
        nav: [
            { text: "Home", link: "/" },
            { text: "Installation", link: '/guide/installation.md' },
            { text: "Guide", link: '/guide/' },
            { text: "Github", link: "https://github.com/botflux/dependency-injection-container" },
        ],
        displayAllHeaders: true,
        sidebar: [
            {
                title: "Guide",
                path: "/guide/",
                collapsable: false,
                sidebarDepth: 2,
                children: [
                    "/guide/",
                    "/guide/installation.md",
                    "/guide/usages.md",
                ]
            }
        ]
    },
    plugins: [['vuepress-plugin-code-copy', true]]
}
