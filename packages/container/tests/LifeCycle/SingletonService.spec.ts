import {DbConnection, UserRepository} from '../Services'
import {SingletonService} from '../../src/LifeCycle/SingletonService'

describe('singleton service lifecycle', function () {
    describe('singleton lifecycle with sync dependencies', function () {
        it('should instantiate a singleton service once for all', function () {
            // Arrange
            const serviceFactoryFunction = (dbConnection: DbConnection) => new UserRepository(dbConnection)
            const singletonService = new SingletonService({ factory: serviceFactoryFunction })

            // Act
            const instance1 = singletonService.instantiate(new DbConnection())
            const instance2 = singletonService.instantiate(new DbConnection())

            // Assert
            expect(instance1).toBe(instance2)
            expect(instance1).toBeInstanceOf(UserRepository)
            expect(instance2).toBeInstanceOf(UserRepository)
        })

        it('should re-instantiate the service if the invalidate callback returns true', function () {
            // Arrange
            const serviceFactoryFunction = () => {
                const connection = new DbConnection()
                connection._isConnected = false
                return connection
            }
            const singletonService = new SingletonService({
                factory: serviceFactoryFunction,
                invalidate: (dbConnection: DbConnection) => !dbConnection.isConnected()
            })

            // Act
            const instance1 = singletonService.instantiate()
            const instance2 = singletonService.instantiate()

            // Assert
            expect(instance1).not.toBe(instance2)
            expect(instance1).toBeInstanceOf(DbConnection)
            expect(instance2).toBeInstanceOf(DbConnection)
        })

        it('should repair the service instead of re-instantiate it if the invalidate callback returns true', function () {
            // Arrange
            const serviceFactoryFunction = () => {
                const dbConnection = new DbConnection()
                dbConnection._isConnected = false
                return dbConnection
            }
            const singletonService = new SingletonService({
                factory: serviceFactoryFunction,
                invalidate: service => !service.isConnected(),
                repair: service => {
                    service.connect()
                    return service
                }
            })

            // Act
            const instance1 = singletonService.instantiate()
            const instance2 = singletonService.instantiate()

            // Assert
            expect(instance1).toBe(instance2)
            expect(instance1).toBeInstanceOf(DbConnection)
            expect(instance2).toBeInstanceOf(DbConnection)
        })
    })

    describe('singleton lifecycle with async dependencies', function () {
        it('should instantiate a singleton service once for all', async function () {
            // Arrange
            const serviceFactoryFunction = async (dbConnection: DbConnection) => new UserRepository(dbConnection)
            const singletonService = new SingletonService({factory: serviceFactoryFunction})

            // Act
            const instance1 = await singletonService.instantiate(new DbConnection())
            const instance2 = await singletonService.instantiate(new DbConnection())

            // Assert
            expect(instance1).toBe(instance2)
            expect(instance1).toBeInstanceOf(UserRepository)
            expect(instance2).toBeInstanceOf(UserRepository)
        })

        it('should re-instantiate the service if the invalidate callback returns true. With an async service the promise should be unwrapped.', async function () {
            // Arrange
            const serviceFactoryFunction = async () => {
                const dbConnection = new DbConnection()
                dbConnection._isConnected = false
                return dbConnection
            }
            const singletonService = new SingletonService({
                factory: serviceFactoryFunction,
                invalidate: service => !service.isConnected()
            })

            // Act
            const instance1 = await singletonService.instantiate()
            const instance2 = await singletonService.instantiate()

            // Assert
            expect(instance1).not.toBe(instance2)
            expect(instance1).toBeInstanceOf(DbConnection)
            expect(instance2).toBeInstanceOf(DbConnection)
        })

        it('should repair the service instead of re-instantiate it if the invalidate callback returns true. With an async service the promise should be unwrapped.', async function () {
            // Arrange
            const serviceFactoryFunction = async () => {
                const dbConnection = new DbConnection()
                dbConnection._isConnected = false
                return dbConnection
            }
            const singletonService = new SingletonService({
                factory: serviceFactoryFunction,
                invalidate: service => !service.isConnected(),
                repair: async service => {
                    service.connect()
                    return service
                }
            })

            // Act
            const instance1 = await singletonService.instantiate()
            const instance2 = await singletonService.instantiate()

            // Assert
            expect(instance1).toBe(instance2)
            expect(instance1).toBeInstanceOf(DbConnection)
            expect(instance2).toBeInstanceOf(DbConnection)
        })
    })
})
