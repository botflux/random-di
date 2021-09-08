import {DbConnection, UserRepository} from '../Services'
import {SyncPromise} from '../../src/SyncPromise'

type Unpromisify<T> = T extends Promise<infer U> ? U : T

type DefaultServiceFactory = (...params: any[]) => any
type InvalidateSingletonServiceInstance<Service> = (service: Service) => boolean
type SingletonServiceParameters<ServiceFactory extends DefaultServiceFactory> = {
    factory: ServiceFactory,
    invalidate?: InvalidateSingletonServiceInstance<Unpromisify<ReturnType<ServiceFactory>>>
}

const defaultInvalidateSingletonServiceInstance = (service: any) => false

class SingletonService<
    ServiceFactory extends DefaultServiceFactory
> {
    private instantiatedService: PromiseLike<Unpromisify<ReturnType<ServiceFactory>> | undefined> = SyncPromise.from(undefined)

    constructor(private readonly params: SingletonServiceParameters<ServiceFactory>) {}

    retrieve(...params: Parameters<ServiceFactory>): ReturnType<ServiceFactory> {
        const invalidate = this.params.invalidate ?? defaultInvalidateSingletonServiceInstance

        const isInvalidPromise = this.instantiatedService.then(
            innerService => innerService ? invalidate(innerService) : false
        )

        const reInstantiatedService = isInvalidPromise.then(
            isInvalid => isInvalid ? this.params.factory(...params) : undefined
        )

        const instance = SyncPromise.all(this.instantiatedService, reInstantiatedService).then(
            ([ instantiated, reInstantiated ]) => reInstantiated ?? instantiated ?? this.params.factory(...params)
        )

        this.instantiatedService = instance

        return instance instanceof SyncPromise
            ? instance.unwrap()
            : instance
    }
}

describe('singleton service lifecycle', function () {
    describe('singleton lifecycle with sync dependencies', function () {
        it('should instantiate a singleton service once for all', function () {
            // Arrange
            const serviceFactoryFunction = (dbConnection: DbConnection) => new UserRepository(dbConnection)
            const singletonService = new SingletonService({ factory: serviceFactoryFunction })

            // Act
            const instance1 = singletonService.retrieve(new DbConnection())
            const instance2 = singletonService.retrieve(new DbConnection())

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
            const instance1 = singletonService.retrieve()
            const instance2 = singletonService.retrieve()

            // Assert
            expect(instance1).not.toBe(instance2)
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
            const instance1 = await singletonService.retrieve(new DbConnection())
            const instance2 = await singletonService.retrieve(new DbConnection())

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
            const instance1 = await singletonService.retrieve()
            const instance2 = await singletonService.retrieve()

            // Assert
            expect(instance1).not.toBe(instance2)
            expect(instance1).toBeInstanceOf(DbConnection)
            expect(instance2).toBeInstanceOf(DbConnection)
        })
    })
})
