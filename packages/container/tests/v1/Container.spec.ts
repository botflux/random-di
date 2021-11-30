import {
    ArticleRepository,
    Configuration,
    ConfigurationLoader,
    DatabaseConnection,
    DbConnection, SomeRepository,
    UserRepository
} from '../Services'
import {ServiceAlreadyRegisteredError} from '../../src/v0'
import {createContainerBuilder, DependencyNotFoundError, LifeCycle} from '../../src/v1/Container'

describe('sync services injection', function () {
    it('should resolve services dependencies', function () {
        // Arrange
        const container = createContainerBuilder()
            .addService({
                name: 'dbConnection',
                factory: () => new DbConnection(),
                lifeCycle: LifeCycle.Singleton
            })
            .addService({
                name: 'userRepository',
                factory: (dbConnection: DbConnection) => new UserRepository(dbConnection),
                lifeCycle: LifeCycle.Transient,
                dependsOn: [ 'dbConnection' ]
            })
            .build()

        // Act
        const userRepository1   = container.get('userRepository')
        const userRepository2   = container.get('userRepository')
        const dbConnection1     = container.get('dbConnection')
        const dbConnection2     = container.get('dbConnection')

        // Assert
        expect(userRepository1).not.toBe(userRepository2)
        expect(dbConnection1).toEqual(dbConnection2)
    })

    it('should resolve services dependencies in a nested services hierarchy', function () {
        // Arrange
        const container = createContainerBuilder()
            .addService({
                name: 'configurationLoader',
                factory: () => new ConfigurationLoader('conf.json')
            })

            .addService({
                name: 'configuration',
                factory: (loader: ConfigurationLoader) => loader.load(),
                dependsOn: [ 'configurationLoader' ]
            })

            .addService({
                name: 'databaseConnection',
                factory: (configuration: Configuration) => new DatabaseConnection(configuration),
                dependsOn: [ 'configuration' ]
            })

            .addService({
                name: 'articleRepository',
                factory: (connection: DatabaseConnection) => new ArticleRepository(connection),
                dependsOn: [ 'databaseConnection' ]
            })

            .build()

        // Act
        const articleRepository1 = container.get<ArticleRepository>('articleRepository')

        // Assert
        expect(articleRepository1.dbConnection.configuration.connectionUri).toBeTruthy()
    })

    it('should throw when a dependency does not exist', function () {
        // Arrange
        const builder = createContainerBuilder()
            .addService({
                name: 'db-connection',
                factory: () => new DbConnection()
            })

        // Act
        const shouldThrow = () => builder.addService({
            name: 'user-repository',
            factory: (dbConnection: DbConnection) => new UserRepository(dbConnection),
            dependsOn: [ 'db-connection-misspelled' ]
        })

        // Assert
        expect(shouldThrow).toThrow(DependencyNotFoundError)
    })

    it('should throw when the dependency is declared twice', function () {
        // Arrange
        const builder = createContainerBuilder()
            .addService({
                name: 'dbConnection',
                factory: () => new DbConnection()
            })

        // Act
        const shouldThrow = () => builder.addService({
            name: 'dbConnection',
            factory: () => new DbConnection()
        })

        // Assert
        expect(shouldThrow).toThrow(ServiceAlreadyRegisteredError)
    })

    it('should throw if the requested service does not exist', function () {
        // Arrange
        const container = createContainerBuilder().build()

        // Act
        const throws = () => container.get('not-existing-service')

        // Assert
        expect(throws).toThrow(Error)
    })

    it('should invalidate singleton instances', function () {
        // Arrange
        const factory = jest.fn(() => {
            const connection = new DbConnection()
            connection._isConnected = false
            return connection
        })
        const container = createContainerBuilder()
            .addService({
                name: 'dbConnection',
                factory,
                lifeCycle: LifeCycle.newSingleton({
                    invalidate: (service: DbConnection) => !service.isConnected(),
                })
            })
            .build()

        // Act
        const dbConnection1 = container.get('dbConnection')
        const dbConnection2 = container.get('dbConnection')

        // Assert
        expect(factory).toBeCalledTimes(2)
        expect(dbConnection1).not.toBe(dbConnection2)
    })

    it.skip('should invalidate singletons that depends on an invalidated singleton', function () {
        // Arrange
        const dbConnectionFactory: () => DbConnection = jest.fn(() => {
            const dbConnection = new DbConnection()
            dbConnection._isConnected = false
            return dbConnection
        })
        let uniqId = 0
        const someRepository = jest.fn((dbConnection: DbConnection) =>
            new SomeRepository(dbConnection, uniqId ++))

        const container = createContainerBuilder()
            .addService({
                name: 'dbConnection',
                factory: dbConnectionFactory,
                lifeCycle: LifeCycle.newSingleton<typeof dbConnectionFactory>({
                    invalidate: service => !service.isConnected()
                })
            })
            .addService({
                name: 'someRepository',
                factory: someRepository,
                lifeCycle: LifeCycle.Singleton,
                dependsOn: [ 'dbConnection' ]
            })
            .build()

        // Act
        const someRepository1 = container.get<SomeRepository>('someRepository')
        const someRepository2 = container.get<SomeRepository>('someRepository')

        // Assert
        expect(someRepository1).not.toBe(someRepository2)
        expect(someRepository).toBeCalledTimes(2)
        expect(dbConnectionFactory).toBeCalledTimes(2)
    })
})

describe('async services injection', function () {
    it('should resolve services dependencies', async function () {
        // Arrange
        const container = createContainerBuilder()
            .addService({
                name: 'dbConnection',
                factory: async () => new DbConnection(),
                lifeCycle: LifeCycle.Singleton
            })
            .addService({
                name: 'userRepository',
                factory: (dbConnection: DbConnection) => new UserRepository(dbConnection),
                lifeCycle: LifeCycle.Transient,
                dependsOn: ['dbConnection']
            })
            .build()

        // Act
        const userRepository1   = await container.getAsync('userRepository')
        const userRepository2   = await container.getAsync('userRepository')
        const dbConnection1     = await container.getAsync('dbConnection')
        const dbConnection2     = await container.getAsync('dbConnection')

        // Assert
        expect(userRepository1).not.toBe(userRepository2)
        expect(dbConnection1).toEqual(dbConnection2)
    })

    it('should resolve services dependencies in a nested services hierarchy', async function () {
        // Arrange
        const container = createContainerBuilder()
            .addService({
                name: 'configurationLoader',
                factory: () => new ConfigurationLoader('conf.json')
            })

            .addService({
                name: 'configuration',
                factory: (loader: ConfigurationLoader) => loader.loadAsync(),
                dependsOn: ['configurationLoader']
            })

            .addService({
                name: 'databaseConnection',
                factory: async (configuration: Configuration) => new DatabaseConnection(configuration),
                dependsOn: ['configuration']
            })

            .addService({
                name: 'articleRepository',
                factory: (connection: DatabaseConnection) => new ArticleRepository(connection),
                dependsOn: ['databaseConnection']
            })

            .build()

        // Act
        const articleRepository1 = await container.getAsync<ArticleRepository>('articleRepository')

        // Assert
        expect(articleRepository1.dbConnection.configuration.connectionUri).toBeTruthy()
    })
})

