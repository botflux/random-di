module.exports = {
    title: "Random DI",
    description: "Manage your application dependencies",
    base: "/random-di/",
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
