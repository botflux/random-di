const baseConfig = require('./jest.config.base')

module.exports = {
    ...baseConfig,
    projects: [ 'jest.config.js' ],
    coverageDirectory: '<rootDir>/coverage/',
    collectCoverageFrom: [
        '<rootDir>/packages/*/src/**/*.ts'
    ],
    moduleDirectories: [
        'node_modules'
    ]
}
