import {ServiceFactory} from '../../src/v0'

class DatabaseConnection {}
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

class ContainerError extends Error {}
class NoServiceFoundError extends ContainerError {
    constructor(serviceName: ServiceNameOrConstructor) {
        super(`There is no service matching the given name: "${serviceNameOrConstructorToString(serviceName)}"`)
    }
}

function isConstructor (constructor: unknown): constructor is Class<any> {
    return constructor !== undefined && constructor !== null && typeof constructor === 'function'
        // @ts-ignore
        && 'name' in constructor
}

function serviceNameOrConstructorToString (serviceNameOrConstructor: ServiceNameOrConstructor): string {
    return isConstructor(serviceNameOrConstructor) ? serviceNameOrConstructor.name : serviceNameOrConstructor
}

type Class<T> = { new(...args: any[]): T }

interface ContainerBuilderInterface {
    fromClass<T>(clazz: Class<T>, options?: FromClassOptions): ContainerBuilderInterface
    fromFactory<T extends DefaultServiceFactory>(fn: T, options: FromFactoryOptions): ContainerBuilderInterface

    build(): ContainerInterface
}

interface ContainerInterface {
    get<T>(serviceName: ServiceNameOrConstructor<T>): T
}

class Container implements ContainerInterface {
    constructor(
        private readonly classes: Map<string, Service>
    ) {
    }

    get<T>(serviceNameOrConstructor: ServiceNameOrConstructor<T>): T {
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
}

type ServiceName = string
type ServiceNameOrConstructor<T = any> = Class<T> | ServiceName

type Service = {
    factory: InstantiableInterface<any>
    dependencies: ServiceNameOrConstructor[],
}

enum LifeCycle { Singleton = "Singleton", Transient = "Transient" }

type FromClassOptions = {
    dependencies?: ServiceNameOrConstructor[],
    name?: ServiceName,
    lifeCycle?: LifeCycle
}
type FromFactoryOptions = {
    name: ServiceName,
    dependencies?: ServiceNameOrConstructor[],
    lifeCycle?: LifeCycle
}

type DefaultServiceFactory = (...params: any[]) => any

interface InstantiableInterface<TServiceFactory extends DefaultServiceFactory> {
    instantiate (...params: Parameters<TServiceFactory>): ReturnType<TServiceFactory>
}

interface InstantiableFactoryInterface {
    fromClass (clazz: Class<any>): InstantiableInterface<ServiceFactory<any>>
    fromFactory (factory: ServiceFactory<any>): InstantiableInterface<ServiceFactory<any>>
}

class TransientInstantiableFactory implements InstantiableFactoryInterface {
    fromClass(clazz: Class<any>): InstantiableInterface<ServiceFactory<any>> {
        return new Transient<(...params: any[]) => any>(
            (...params: any[]) => new clazz(...params)
        )
    }

    fromFactory(factory: ServiceFactory<any>): InstantiableInterface<ServiceFactory<any>> {
        return new Transient(factory)
    }
}

class SingletonInstantiableFactory implements InstantiableFactoryInterface {
    fromClass(clazz: Class<any>): InstantiableInterface<ServiceFactory<any>> {
        return new Singleton<(...params: any[]) => any>(
            (...params: any[]) => new clazz(...params)
        )
    }

    fromFactory(factory: ServiceFactory<any>): InstantiableInterface<ServiceFactory<any>> {
        return new Singleton(factory)
    }
}

class Transient<TServiceFactory extends DefaultServiceFactory> implements InstantiableInterface<TServiceFactory> {
    constructor(private readonly factory: TServiceFactory) {}

    instantiate(...params: Parameters<TServiceFactory>): ReturnType<TServiceFactory> {
        return this.factory(...params)
    }
}

class Singleton<TServiceFactory extends DefaultServiceFactory> implements InstantiableInterface<TServiceFactory> {
    private instance?: ReturnType<TServiceFactory>

    constructor(private readonly factory: TServiceFactory) {}

    instantiate(...params: Parameters<TServiceFactory>): ReturnType<TServiceFactory> {
        if (!this.instance)
            this.instance = this.factory(...params)

        return this.instance as ReturnType<TServiceFactory>
    }
}

function createInstantiableFactory (lifeCycle: LifeCycle): InstantiableFactoryInterface {
    return lifeCycle === LifeCycle.Singleton
        ? new SingletonInstantiableFactory()
        : new TransientInstantiableFactory()
}

class ContainerBuilder implements ContainerBuilderInterface {
    constructor(
        private readonly classes: Map<string, Service> = new Map()
    ) {
    }

    fromClass<T>(clazz: Class<T>, { dependencies = [], name, lifeCycle = LifeCycle.Transient }: FromClassOptions = {}): ContainerBuilderInterface {
        const serviceName = name ?? clazz.name
        const factory = createInstantiableFactory(lifeCycle).fromClass(clazz)

        this.classes.set(serviceName, { factory, dependencies })
        return this
    }

    fromFactory<T extends DefaultServiceFactory>(fn: T, { name, dependencies = [], lifeCycle = LifeCycle.Transient }: FromFactoryOptions): ContainerBuilderInterface {
        const factory = createInstantiableFactory(lifeCycle).fromFactory(fn)

        this.classes.set(name, { factory, dependencies })
        return this
    }

    build(): ContainerInterface {
        return new Container(this.classes)
    }
}

function newBuilder(): ContainerBuilderInterface {
    return new ContainerBuilder()
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
