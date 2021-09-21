import {DbConnection, UserRepository} from '../../Services'
import {SingletonService} from '../../../src/v1/LifeCycle/SingletonService'

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

        it('should destroy sync services using a sync callback', function () {
            // Arrange
            const serviceFactoryFunction = () => {
                const dbConnection = new DbConnection()
                dbConnection._isConnected = true
                return dbConnection
            }
            const singletonService = new SingletonService({
                factory: serviceFactoryFunction,
                destroy: dbConnection => dbConnection.disconnect()
            })

            // Act
            const instance = singletonService.instantiate()
            singletonService.destroy()

            // Assert
            expect(instance._isConnected).toBe(false)
        })

        it('should not destroy sync service if not instantiated', function () {
            // Arrange
            const serviceFactory = () => {
                const dbConnection = new DbConnection()
                dbConnection._isConnected = true
                return dbConnection
            }

            const destroyFunction = jest.fn()

            const singletonService = new SingletonService({
                factory: serviceFactory,
                destroy: destroyFunction
            })

            // Act
            singletonService.destroy()

            // Assert
            expect(destroyFunction).not.toBeCalled()
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

        it('should destroy an async service with an async destroy callback', async function () {
            // Arrange
            const serviceFactoryFunction = async () => {
                const dbConnection = new DbConnection()
                dbConnection._isConnected = true
                return dbConnection
            }
            const singletonService = new SingletonService({
                factory: serviceFactoryFunction,
                destroy: async dbConnection => dbConnection.disconnect()
            })

            // Act
            const instance = await singletonService.instantiate()
            await singletonService.destroy()

            // Assert
            expect(instance._isConnected).toBe(false)
        })

        it('should not destroy async service if not instantiated', async function () {
            // Arrange
            const serviceFactory = async () => new DbConnection()
            const destroyFunction = jest.fn(async () => {
            })
            const singletonService = new SingletonService({
                factory: serviceFactory,
                destroy: destroyFunction
            })

            // Act
            await singletonService.destroy()

            // Assert
            expect(destroyFunction).not.toBeCalled()
        })
    })
})
