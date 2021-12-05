import {isSyncPromise, SyncPromise, unwrapIfSyncPromise} from '../../src/v1/SyncPromise'

class DatabaseConnection {
    public isConnected = true
}
class UserRepository {
    constructor(
        public readonly databaseConnection: DatabaseConnection
    ) {
    }
}

class RandomNumberService {
    constructor(
        public readonly n: string = Math.random().toString()
    ) {}
}

/**
 * Base error for the library.
 */
class ContainerError extends Error {}

/**
 * Thrown when a service was not found.
 */
class NoServiceFoundError extends ContainerError {
    constructor(serviceName: ServiceNameOrConstructor | ServiceNameOrConstructor[]) {
        const normalizedServiceName = Array.isArray(serviceName)
            ? serviceName
                .map(serviceNameOrConstructorToString)
                .map(name => `"${name}"`)
                .join(", ")
            : `"${serviceNameOrConstructorToString(serviceName)}"`

        const multipleServiceNames = Array.isArray(serviceName) && serviceName.length > 1

        super(`There is no service matching the given name${multipleServiceNames ? "s": ""}: ${normalizedServiceName}`)
    }
}

/**
 * Thrown when a service is registered twice.
 */
class ServiceAlreadyRegisteredError extends ContainerError {
    constructor(alreadyRegisteredServiceName: ServiceNameOrConstructor) {
        super(`Service named "${serviceNameOrConstructorToString(alreadyRegisteredServiceName)}" was already registered.`)
    }
}

/**
 * Thrown when there is a circular dependencies between services.
 */
class CircularDependencyError extends ContainerError {
    constructor(serviceWithCircularDependency: ServiceNameOrConstructor, serviceNameOrConstructors: ServiceNameOrConstructor[]) {
        const circularPath = serviceNameOrConstructors
            .map(serviceNameOrConstructorToString)
            .map(name => `"${name}"`)
            .join(" -> ")
        super(`Service named "${serviceNameOrConstructorToString(serviceWithCircularDependency)}" has a circular dependency. Here is the circular path: ${circularPath}`)
    }
}

/**
 * Thrown when a repair function is passed to a transient service.
 */
class CannotRepairTransientError extends ContainerError {
    constructor(serviceNameOrConstructor: ServiceNameOrConstructor) {
        super(
            `The service named "${serviceNameOrConstructorToString(serviceNameOrConstructor)}" is declared as a "LifeCycle.Transient" service with a repair function. `
            + `Only "LifeCycle.Singleton" services can be repaired.`
        )
    }
}

/**
 * Thrown when services are retrieved after the container was destroyed.
 */
class CannotRetrieveDestroyedServiceError extends ContainerError {
    constructor(serviceNameOrConstructor: ServiceNameOrConstructor) {
        super(
            `The container has destroyed all of its services, so "${serviceNameOrConstructorToString(serviceNameOrConstructor)}" cannot be retrieved anymore.`
        )
    }
}

/**
 * Thrown when a destroy function is passed to a transient service.
 */
class CannotDestroyTransientError extends ContainerError {
    constructor(serviceNameOrConstructor: ServiceNameOrConstructor) {
        super(
            `Service named "${serviceNameOrConstructorToString(serviceNameOrConstructor)}" was registered as a "LifeCycle.Transient" with a destroy callback. `
            + `Only "LifeCycle.Singleton" services can be destroyed using a destroy callback.`
        )
    }
}

type SyncOrAsync<T> = T | Promise<T>

type DefaultFunction = (...params: any[]) => any
type AsyncOrSyncFunction<TFunction extends DefaultFunction> =
    TFunction | ((...params: Parameters<TFunction>) => Promise<ReturnType<TFunction>>)

/**
 * Returns true if the passed variable is a constructor; otherwise false.
 *
 * @param constructor
 */
function isConstructor (constructor: unknown): constructor is Class<any> {
    return constructor !== undefined && constructor !== null && typeof constructor === 'function'
        // @ts-ignore
        && 'name' in constructor
}

/**
 * Stringify service names.
 *
 * @param serviceNameOrConstructor
 */
function serviceNameOrConstructorToString (serviceNameOrConstructor: ServiceNameOrConstructor): string {
    return isConstructor(serviceNameOrConstructor) ? serviceNameOrConstructor.name : serviceNameOrConstructor
}

type Class<T> = { new(...args: any[]): T }

/**
 * Helps creating new container.
 */
interface ContainerBuilderInterface {
    /**
     * Add a new service from a class constructor.
     *
     * @param clazz
     * @param options
     */
    fromClass<T>(clazz: Class<T>, options?: FromClassOptions<T>): ContainerBuilderInterface

    /**
     * Add a new service from a factory function.
     *
     * @param fn
     * @param options
     */
    fromFactory<T extends DefaultServiceFactory>(fn: T, options: FromFactoryOptions<ReturnType<T>>): ContainerBuilderInterface

    /**
     * Add a new service from a constant.
     *
     * @param value
     * @param options
     */
    fromConstant<T>(value: T, options: FromConstantOptions): ContainerBuilderInterface

    /**
     * Throw if there are circular dependencies between services.
     * If there are circular dependencies, a {@ref CircularDependencyError} will be thrown.
     *
     * By default, circular dependencies are not possible because services have to be registered in order.
     * You can use the `{ enableDeclarationDisorder: true }` parameter when creating a new builder
     * in order to allow declaration disorder.
     */
    checkDependenciesValidity(): ContainerBuilderInterface

    /**
     * Create a container from the current container builder.
     */
    build(): ContainerInterface
}

interface ContainerInterface {
    get<T>(serviceName: ServiceNameOrConstructor<T>): T
    destroy(): Promise<void>
}

class Container implements ContainerInterface {
    private isDestroyed: boolean = false

    constructor(
        private readonly classes: Map<string, Service>
    ) {
    }

    get<T>(serviceNameOrConstructor: ServiceNameOrConstructor<T>): T {
        if (this.isDestroyed) {
            throw new CannotRetrieveDestroyedServiceError(serviceNameOrConstructor)
        }

        const serviceName = serviceNameOrConstructorToString(serviceNameOrConstructor)
        const service = this.classes.get(serviceName)

        if (!service) {
            throw new NoServiceFoundError(serviceName)
        }

        const { factory, dependencies } = service

        return factory.instantiate(
            ...dependencies.map(dependency => this.get(dependency))
        )
    }

    destroy() {
        let destroyResult: Array<Promise<void> | void> = []

        for (const [ , { factory } ] of this.classes) {
            if (isDestroyable(factory)) {
                destroyResult = [ ...destroyResult, factory.destroy() ]
            }
        }

        this.classes.clear()
        this.isDestroyed = true

        return Promise.all(
            destroyResult.filter(maybePromise => maybePromise instanceof Promise)
        ) as unknown as Promise<void>
    }
}

type ServiceName = string
type ServiceNameOrConstructor<T = any> = Class<T> | ServiceName

type Service = {
    factory: InstantiableInterface<any>
    dependencies: ServiceNameOrConstructor[],
}

enum LifeCycle { Singleton = "Singleton", Transient = "Transient" }

type RepairService <T, Dependencies extends any[] = any[]> = (service: T, ...dependencies: Dependencies) => T
type DestroyService <T> = AsyncOrSyncFunction<(service: T) => void>

type FromClassOptions<T = any> = {
    dependencies?: ServiceNameOrConstructor[],
    name?: ServiceName,
    lifeCycle?: LifeCycle,
    repair?: RepairService<T>,
    destroy?: DestroyService<T>
}

type FromFactoryOptions<T = any> = {
    name: ServiceName,
    dependencies?: ServiceNameOrConstructor[],
    lifeCycle?: LifeCycle
    repair?: RepairService<T>,
    destroy?: DestroyService<T>
}
type FromConstantOptions = {
    name: ServiceName
}

type DefaultServiceFactory = (...params: any[]) => any

interface DestroyableInterface {
    destroy (): SyncOrAsync<void>
}

function isDestroyable (instantiable: InstantiableInterface<any>): instantiable is DestroyableInterface & InstantiableInterface<any> {
    return 'destroy' in instantiable
}

interface InstantiableInterface<TServiceFactory extends DefaultServiceFactory> {
    instantiate (...params: Parameters<TServiceFactory>): ReturnType<TServiceFactory>
}

interface InstantiableFactoryInterface {
    fromFunction(factory: DefaultServiceFactory, repair?: RepairService<any>, destroy?: DestroyService<any>): InstantiableInterface<DefaultServiceFactory>
}

class TransientInstantiableFactory implements InstantiableFactoryInterface {
    fromFunction(factory: DefaultServiceFactory): InstantiableInterface<DefaultServiceFactory> {
        return new Transient(factory)
    }
}

class SingletonInstantiableFactory implements InstantiableFactoryInterface {
    fromFunction(factory: DefaultServiceFactory, repair?: RepairService<any>, destroy?: DestroyService<any>): InstantiableInterface<DefaultServiceFactory> {
        return new Singleton(factory, repair, destroy)
    }
}

class Transient<TServiceFactory extends DefaultServiceFactory> implements InstantiableInterface<TServiceFactory> {
    constructor(private readonly factory: TServiceFactory) {}

    instantiate(...params: Parameters<TServiceFactory>): ReturnType<TServiceFactory> {
        return this.factory(...params)
    }
}

class Singleton<TServiceFactory extends DefaultServiceFactory> implements InstantiableInterface<TServiceFactory>, DestroyableInterface {
    private instance?: ReturnType<TServiceFactory>

    constructor(
        private readonly factory: TServiceFactory,
        private readonly repair?: RepairService<ReturnType<TServiceFactory>>,
        private readonly destroyFn?: DestroyService<ReturnType<TServiceFactory>>
    ) {}

    instantiate(...params: Parameters<TServiceFactory>): ReturnType<TServiceFactory> {
        if (!this.instance)
            this.instance = this.factory(...params)


        this.instance = this.repair?.(<ReturnType<TServiceFactory>> this.instance, ...params) ?? this.instance

        return this.instance as ReturnType<TServiceFactory>
    }

    destroy(): SyncOrAsync<void> {
        if (this.destroyFn && this.instance) {
            const maybePromise = this.destroyFn(this.instance)
            const syncOrAsync = SyncPromise.fromSyncOrAsync(maybePromise)

            const deletedInstancePromise = syncOrAsync.then(
                () => {
                    delete this.instance
                }
            )

            return unwrapIfSyncPromise(deletedInstancePromise)
        }
    }
}

function createInstantiableFactory (lifeCycle: LifeCycle): InstantiableFactoryInterface {
    return lifeCycle === LifeCycle.Singleton
        ? new SingletonInstantiableFactory()
        : new TransientInstantiableFactory()
}

class ContainerBuilder implements ContainerBuilderInterface {
    private readonly enableDeclarationDisorder: boolean

    constructor(
        { enableDeclarationDisorder = false }: BuilderFactoryOptions,
        private readonly classes: Map<string, Service> = new Map()
    ) {
        this.enableDeclarationDisorder = enableDeclarationDisorder
    }

    fromClass<T>(clazz: Class<T>, { dependencies = [], name, lifeCycle = LifeCycle.Transient, repair, destroy }: FromClassOptions<T> = {}): ContainerBuilderInterface {
        const serviceName = name ?? clazz.name
        const fn = (...params: any[]) => new clazz(...params)

        return this.fromFactory(
            fn,
            { name: serviceName, lifeCycle, dependencies, repair, destroy }
        )
    }

    fromFactory<T extends DefaultServiceFactory>(fn: T, { name, dependencies = [], lifeCycle = LifeCycle.Transient, repair, destroy }: FromFactoryOptions): ContainerBuilderInterface {
        if (this.classes.has(name)) {
            throw new ServiceAlreadyRegisteredError(name)
        }

        if (lifeCycle === LifeCycle.Transient && !!repair) {
            throw new CannotRepairTransientError(name)
        }

        if (lifeCycle === LifeCycle.Transient && !!destroy) {
            throw new CannotDestroyTransientError(name)
        }

        const missingDependencies = dependencies
            ?.filter(dependency => !this.classes.has(serviceNameOrConstructorToString(dependency))) ?? []

        if (!this.enableDeclarationDisorder && missingDependencies.length > 0) {
            throw new NoServiceFoundError(missingDependencies)
        }

        const factory = createInstantiableFactory(lifeCycle).fromFunction(fn, repair, destroy)

        this.classes.set(name, { factory, dependencies })
        return this
    }

    fromConstant<T>(value: T, { name }: FromConstantOptions): ContainerBuilderInterface {
        return this.fromFactory(
            () => value,
            { name, lifeCycle: LifeCycle.Transient, dependencies: [] }
        )
    }

    checkDependenciesValidity(): ContainerBuilderInterface {
        for (const [ serviceName,  ] of this.classes) {
            const [ hasCircularDependencies, circularDependencyPath ] = this.hasCircularDependency(serviceName)

            if (hasCircularDependencies) {
                throw new CircularDependencyError(serviceName, circularDependencyPath)
            }
        }

        return this
    }

    build(): ContainerInterface {
        return new Container(this.classes)
    }

    private hasCircularDependency (serviceName: string): [boolean, string[]] {
        let alreadyVisitedService: string[] = []

        return [this.find(serviceName, name => {
            const wasAlreadyVisited = alreadyVisitedService.includes(name)
            alreadyVisitedService = [ ...alreadyVisitedService, name ]

            return wasAlreadyVisited;
        }), alreadyVisitedService]
    }

    private find(serviceName: string, fn: (serviceName: string) => boolean): boolean {
        const service = this.classes.get(serviceName)

        if (!service) return false

        const found = fn(serviceName)

        if(found) return found

        for (const dependency of service.dependencies) {
            const stringifiedName = serviceNameOrConstructorToString(dependency)

            const found = this.find(stringifiedName, fn)

            if (found) return found
        }

        return false
    }
}

type BuilderFactoryOptions = {
    enableDeclarationDisorder?: boolean
}

function newBuilder(options: BuilderFactoryOptions = {}): ContainerBuilderInterface {
    return new ContainerBuilder(options)
}

describe('serviceNameOrConstructorNameToString', function () {
    it('should return the constructor name', function () {
        expect(serviceNameOrConstructorToString(UserRepository)).toBe("UserRepository")
    })

    it('should return the service name', function () {
        expect(serviceNameOrConstructorToString('database')).toBe("database")
    })
})

describe('isConstructor', function () {
    it('should return true if its a constructor', function () {
        expect(isConstructor(UserRepository)).toBe(true)
    })

    it('should return false if its a string', function () {
        expect(isConstructor('userRepository')).toBe(false)
    })
})

it('should create a container', function () {
    const container = newBuilder().build()

    expect(container).not.toBeNull()
})

it('should instantiate class without any dependencies', function () {
    const container = newBuilder ()
        .fromClass(DatabaseConnection)
        .build()

    const databaseConnection = container.get(DatabaseConnection)

    expect(databaseConnection).toBeInstanceOf(DatabaseConnection)
})

it('should throw if there is no service matching the class', function () {
    const container = newBuilder().build()

    const shouldThrow = () => container.get(DatabaseConnection)

    expect(shouldThrow).toThrow(new NoServiceFoundError(DatabaseConnection))
})

it('should construct the service\'s dependencies when instantiating a service', function () {
    const container = newBuilder()
        .fromClass(DatabaseConnection)
        .fromClass(UserRepository, { dependencies: [ DatabaseConnection ] })
        .build()

    const userRepository = container.get(UserRepository)

    expect(userRepository).toBeInstanceOf(UserRepository)
    expect(userRepository.databaseConnection).toBeInstanceOf(DatabaseConnection)
})

it('should allow service name overriding', function () {
    const container = newBuilder()
        .fromClass(DatabaseConnection, { name: "database" })
        .build()

    const database = container.get("database")

    expect(database).toBeInstanceOf(DatabaseConnection)
})

it("should allow the dependencies' names to be overridden", function () {
    const container = newBuilder()
        .fromClass(DatabaseConnection, { name: "database" })
        .fromClass(UserRepository, { dependencies: [ "database" ], name: "userRepository" })
        .build()

    const userRepository = container.get<UserRepository>("userRepository")

    expect(userRepository).toBeInstanceOf(UserRepository)
    expect(userRepository.databaseConnection).toBeInstanceOf(DatabaseConnection)
})

it('should cache services instances for singleton services', function () {
    const container = newBuilder()
        .fromClass(RandomNumberService, { lifeCycle: LifeCycle.Singleton })
        .build()

    const randomNumberService1 = container.get(RandomNumberService)
    const randomNumberService2 = container.get(RandomNumberService)

    expect(randomNumberService1).toBeInstanceOf(RandomNumberService)
    expect(randomNumberService2).toBeInstanceOf(RandomNumberService)
    expect(randomNumberService1.n).toBe(randomNumberService2.n)
    expect(randomNumberService1).toBe(randomNumberService2)
})

it('should not cache instances for transient services', function () {
    const container = newBuilder()
        .fromClass(RandomNumberService, { lifeCycle: LifeCycle.Transient })
        .build()

    const randomNumberService1 = container.get(RandomNumberService)
    const randomNumberService2 = container.get(RandomNumberService)

    expect(randomNumberService1).toBeInstanceOf(RandomNumberService)
    expect(randomNumberService2).toBeInstanceOf(RandomNumberService)
    expect(randomNumberService1.n).not.toBe(randomNumberService2.n)
    expect(randomNumberService1).not.toBe(randomNumberService2)
})

it('should by default create transient service that are not cached', function () {
    const container = newBuilder()
        .fromClass(RandomNumberService)
        .build()

    const randomNumberService1 = container.get(RandomNumberService)
    const randomNumberService2 = container.get(RandomNumberService)

    expect(randomNumberService1).toBeInstanceOf(RandomNumberService)
    expect(randomNumberService2).toBeInstanceOf(RandomNumberService)
    expect(randomNumberService1.n).not.toBe(randomNumberService2.n)
    expect(randomNumberService1).not.toBe(randomNumberService2)
})

it('should create service from factory function', function () {
    const container = newBuilder()
        .fromFactory(() => new RandomNumberService(), { name: 'randomNumberService' })
        .build()

    const randomNumberService = container.get('randomNumberService')

    expect(randomNumberService).toBeInstanceOf(RandomNumberService)
})

it('should create service from factory with dependencies', function () {
    const container = newBuilder()
        .fromClass(DatabaseConnection)
        .fromFactory((database: DatabaseConnection) => new UserRepository(database), { name: 'userRepository', dependencies: [ DatabaseConnection ] })
        .build()

    const userRepository = container.get<UserRepository>('userRepository')

    expect(userRepository).toBeInstanceOf(UserRepository)
    expect(userRepository.databaseConnection).toBeInstanceOf(DatabaseConnection)
})

it('should cache instance created from singleton factory', function () {
    const container = newBuilder()
        .fromFactory(() => new RandomNumberService(), { name: 'number', lifeCycle: LifeCycle.Singleton })
        .build()

    const randomNumber1 = container.get<RandomNumberService>('number')
    const randomNumber2 = container.get<RandomNumberService>('number')

    expect(randomNumber1).toBeInstanceOf(RandomNumberService)
    expect(randomNumber2).toBeInstanceOf(RandomNumberService)
    expect(randomNumber1.n).toBe(randomNumber2.n)
})

it('should not cache instance created from factory by default', function () {
    const container = newBuilder()
        .fromFactory(() => new RandomNumberService(), { name: 'number' })
        .build()

    const randomNumber1 = container.get<RandomNumberService>('number')
    const randomNumber2 = container.get<RandomNumberService>('number')

    expect(randomNumber1).toBeInstanceOf(RandomNumberService)
    expect(randomNumber2).toBeInstanceOf(RandomNumberService)
    expect(randomNumber1.n).not.toBe(randomNumber2.n)
})

it('should not cache instance created from transient factory', function () {
    const container = newBuilder()
        .fromFactory(() => new RandomNumberService(), { name: 'number', lifeCycle: LifeCycle.Transient })
        .build()

    const randomNumber1 = container.get<RandomNumberService>('number')
    const randomNumber2 = container.get<RandomNumberService>('number')

    expect(randomNumber1).toBeInstanceOf(RandomNumberService)
    expect(randomNumber2).toBeInstanceOf(RandomNumberService)
    expect(randomNumber1.n).not.toBe(randomNumber2.n)
})

it('should create service from constant', function () {
    const container = newBuilder()
        .fromConstant(78, { name: 'n' })
        .build()

    const n = container.get('n')

    expect(n).toBe(78)
})

it('should not register already registered service', function () {
    const builder = newBuilder()
        .fromConstant(new DatabaseConnection(), { name: 'db' })

    const throw1 = () => builder.fromConstant(new DatabaseConnection(), { name: 'db' })
    const throw2 = () => builder.fromFactory(() => new DatabaseConnection(), { name: 'db' })
    const throw3 = () => builder.fromClass(DatabaseConnection, { name: 'db' })

    expect(throw1).toThrow(new ServiceAlreadyRegisteredError("db"))
    expect(throw2).toThrow(new ServiceAlreadyRegisteredError("db"))
    expect(throw3).toThrow(new ServiceAlreadyRegisteredError("db"))
})

describe('ServiceAlreadyRegisteredError', function () {
    it('should create the error from a service name', function () {
        const error = new ServiceAlreadyRegisteredError("userRepository")
        expect(error.message).toBe('Service named "userRepository" was already registered.')
    })

    it('should create the error from a constructor', function () {
        const error = new ServiceAlreadyRegisteredError(UserRepository)
        expect(error.message).toBe('Service named "UserRepository" was already registered.')
    })
})

it('should not allow circular dependencies between services', function () {
    const factory = () => "some_constant"

    const throws = () => newBuilder()
        .fromFactory(factory, { name: "constant1", dependencies: [ "constant2" ] })
        .fromFactory(factory, { name: "constant2", dependencies: [ "constant1" ] })

    expect(throws).toThrow(new NoServiceFoundError("constant2"))
})

describe('NoServiceFoundError', function () {
    it('should create the error with one service name', function () {
        const error = new NoServiceFoundError("db")
        expect(error.message).toBe('There is no service matching the given name: "db"')
    })

    it('should create the error with one constructor', function () {
        const error = new NoServiceFoundError(DatabaseConnection)
        expect(error.message).toBe('There is no service matching the given name: "DatabaseConnection"')
    })

    it('should create the error from an array of service names with one item', function () {
        const error = new NoServiceFoundError([ "db" ])
        expect(error.message).toBe('There is no service matching the given name: "db"')
    })

    it('should create the error from an array of constructors with one item', function () {
        const error = new NoServiceFoundError([ DatabaseConnection ])
        expect(error.message).toBe('There is no service matching the given name: "DatabaseConnection"')
    })

    it('should create the error from an array of service names and constructors', function () {
        const error = new NoServiceFoundError([ "db", DatabaseConnection ])
        expect(error.message).toBe('There is no service matching the given names: "db", "DatabaseConnection"')
    })
})

it('should not allow circular dependencies between services by using a method', function () {
    const builder = newBuilder({ enableDeclarationDisorder: true })
        .fromClass(UserRepository, { dependencies: [ DatabaseConnection ] })
        .fromClass(DatabaseConnection, { dependencies: [ UserRepository ] })

    const throws = () => builder.checkDependenciesValidity()

    expect(throws).toThrow(new CircularDependencyError(UserRepository, [ UserRepository, DatabaseConnection, UserRepository ]))
})

it('should allow non-circular dependencies between services by using a method', function () {
    const builder = newBuilder({ enableDeclarationDisorder: true })
        .fromClass(UserRepository, { dependencies: [ DatabaseConnection ] })
        .fromClass(DatabaseConnection)

    const throws = () => builder.checkDependenciesValidity()

    expect(throws).not.toThrow(new CircularDependencyError(UserRepository, [ UserRepository, DatabaseConnection, UserRepository ]))
})

it('should repair instances if broken', function () {
    const container = newBuilder()
        .fromFactory(() => new DatabaseConnection(), {
            name: 'database',
            repair: database => {
                database.isConnected = true
                return database
            },
            lifeCycle: LifeCycle.Singleton
        })
        .build()

    const database1 = container.get<DatabaseConnection>('database')
    database1.isConnected = false
    const database2 = container.get<DatabaseConnection>('database')

    expect(database1.isConnected).toBe(true)
    expect(database2.isConnected).toBe(true)
})

it('should repair class instances if broken', function () {
    const container = newBuilder()
        .fromClass(DatabaseConnection, {
            repair: service => {
                service.isConnected = true
                return service
            },
            lifeCycle: LifeCycle.Singleton
        })
        .build()

    const database1 = container.get(DatabaseConnection)
    database1.isConnected = false
    const database2 = container.get(DatabaseConnection)

    expect(database1.isConnected).toBe(true)
    expect(database2.isConnected).toBe(true)
})

it('should not allow repair function for transient services', function () {
    const throws1 = () => newBuilder()
        .fromClass(DatabaseConnection, { repair: service => service })

    const throws2 = () => newBuilder()
        .fromFactory(() => new DatabaseConnection(), { repair: service => service, name: 'db' })

    expect(throws1).toThrow(new CannotRepairTransientError(DatabaseConnection))
    expect(throws2).toThrow(new CannotRepairTransientError('db'))
})

it('should destroy all the services', function () {
    const container = newBuilder()
        .fromClass(DatabaseConnection, { lifeCycle: LifeCycle.Singleton })
        .fromClass(UserRepository, { dependencies: [ DatabaseConnection ], lifeCycle: LifeCycle.Singleton })
        .build()

    container.destroy()

    const shouldThrow = () => container.get(UserRepository)

    expect(shouldThrow).toThrow(new CannotRetrieveDestroyedServiceError(UserRepository))
})

describe('CannotRetrieveDestroyedServiceError', function () {
    it('should create the error from a constructor', function () {
        expect(new CannotRetrieveDestroyedServiceError(UserRepository).message)
            .toBe(`The container has destroyed all of its services, so "UserRepository" cannot be retrieved anymore.`)
    })

    it('should create the error from a string', function () {
        expect(new CannotRetrieveDestroyedServiceError("db").message)
            .toBe(`The container has destroyed all of its services, so "db" cannot be retrieved anymore.`)
    })
})

it('should destroy services using a destroy callback', function () {
    const destroyFn = jest.fn()

    const container = newBuilder()
        .fromFactory(() => new DatabaseConnection, {
            lifeCycle: LifeCycle.Singleton,
            destroy: destroyFn,
            name: DatabaseConnection.name
        })
        .fromClass(UserRepository)
        .build()

    const database = container.get(DatabaseConnection)

    container.destroy()

    expect(destroyFn).toBeCalledTimes(1)
    expect(destroyFn).toHaveBeenCalledWith(database)
})

it('should not call the destroy callback if the service was not instantiated', function () {
    const destroyFn = jest.fn()

    const container = newBuilder()
        .fromFactory(() => new DatabaseConnection, {
            lifeCycle: LifeCycle.Singleton,
            destroy: destroyFn,
            name: DatabaseConnection.name
        })
        .fromClass(UserRepository)
        .build()

    container.destroy()

    expect(destroyFn).toBeCalledTimes(0)
})

it('should destroy class instances using a destroy callback', function () {
    const destroyFn = jest.fn()

    const container = newBuilder()
        .fromClass(DatabaseConnection, {
            lifeCycle: LifeCycle.Singleton,
            destroy: destroyFn
        })
        .fromClass(UserRepository)
        .build()

    const database = container.get(DatabaseConnection)

    container.destroy()

    expect(destroyFn).toBeCalledTimes(1)
    expect(destroyFn).toHaveBeenCalledWith(database)
})

it('should not allow transient service to have destroy callback', function () {
    const throws1 = () => newBuilder().fromFactory(() => new DatabaseConnection(), { destroy: service => {}, name: 'db' })
    const throws2 = () => newBuilder().fromClass(DatabaseConnection, { destroy: service => {} })

    expect(throws1).toThrow(new CannotDestroyTransientError('db'))
    expect(throws2).toThrow(new CannotDestroyTransientError(DatabaseConnection))
})

it('should repair services that depends on repaired services', function () {
    const container = newBuilder()
        .fromFactory(() => new DatabaseConnection(), {
            name: "db",
            lifeCycle: LifeCycle.Singleton,
            repair: service => {
                service.isConnected = true
                return service
            }
        })
        .fromFactory((db: DatabaseConnection) => new UserRepository(db), {
            name: "userRepository",
            lifeCycle: LifeCycle.Singleton,
            repair: (userRepository: UserRepository, database: DatabaseConnection) => new UserRepository(database),
            dependencies: [ "db" ]
        })
        .build()

    const database1 = container.get<DatabaseConnection>("db")
    const userRepository1 = container.get<UserRepository>("userRepository")
    database1.isConnected = false
    const database2 = container.get<DatabaseConnection>("db")
    const userRepository2 = container.get<UserRepository>("userRepository")

    expect(database1).toBeInstanceOf(DatabaseConnection)
    expect(database2).toBeInstanceOf(DatabaseConnection)
    expect(userRepository1).toBeInstanceOf(UserRepository)
    expect(userRepository2).toBeInstanceOf(UserRepository)
    expect(userRepository1).not.toBe(userRepository2)
    expect(database1).toBe(database2)
    expect(userRepository2.databaseConnection).toBeInstanceOf(DatabaseConnection)
})

it('should allow async destroy function', function () {
    const destroyFn = jest.fn(async service => service.isConnected = false)

    const container = newBuilder()
        .fromClass(DatabaseConnection, {
            lifeCycle: LifeCycle.Singleton,
            destroy: destroyFn
        })
        .build()

    container.get(DatabaseConnection)
    container.destroy()

    expect(destroyFn).toBeCalledTimes(1)
})

it('should catch rejection when passing async destroy function', function () {
    const destroyFn = jest.fn(service => Promise.reject(new Error("Went wrong")))

    const container = newBuilder()
        .fromClass(DatabaseConnection, {
            lifeCycle: LifeCycle.Singleton,
            destroy: destroyFn
        })
        .build()

    container.get(DatabaseConnection)
    const rejection = container.destroy()

    expect(destroyFn).toBeCalledTimes(1)
    expect(rejection).rejects.toThrow(new Error("Went wrong"))
})


