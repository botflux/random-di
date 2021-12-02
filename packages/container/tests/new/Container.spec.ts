
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
class ServiceAlreadyRegisteredError extends ContainerError {
    constructor(alreadyRegisteredServiceName: ServiceNameOrConstructor) {
        super(`Service named "${serviceNameOrConstructorToString(alreadyRegisteredServiceName)}" was already registered.`)
    }
}
class CircularDependencyError extends ContainerError {
    constructor(serviceWithCircularDependency: ServiceNameOrConstructor, serviceNameOrConstructors: ServiceNameOrConstructor[]) {
        const circularPath = serviceNameOrConstructors
            .map(serviceNameOrConstructorToString)
            .map(name => `"${name}"`)
            .join(" -> ")
        super(`Service named "${serviceNameOrConstructorToString(serviceWithCircularDependency)}" has a circular dependency. Here is the circular path: ${circularPath}`)
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
    fromConstant<T>(value: T, options: FromConstantOptions): ContainerBuilderInterface

    checkDependenciesValidity(): ContainerBuilderInterface

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
type FromConstantOptions = {
    name: ServiceName
}

type DefaultServiceFactory = (...params: any[]) => any

interface InstantiableInterface<TServiceFactory extends DefaultServiceFactory> {
    instantiate (...params: Parameters<TServiceFactory>): ReturnType<TServiceFactory>
}

interface InstantiableFactoryInterface {
    fromFunction(factory: DefaultServiceFactory): InstantiableInterface<DefaultServiceFactory>
}

class TransientInstantiableFactory implements InstantiableFactoryInterface {
    fromFunction(factory: DefaultServiceFactory): InstantiableInterface<DefaultServiceFactory> {
        return new Transient(factory)
    }
}

class SingletonInstantiableFactory implements InstantiableFactoryInterface {
    fromFunction(factory: DefaultServiceFactory): InstantiableInterface<DefaultServiceFactory> {
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
    private readonly enableDeclarationDisorder: boolean

    constructor(
        { enableDeclarationDisorder = false }: BuilderFactoryOptions,
        private readonly classes: Map<string, Service> = new Map()
    ) {
        this.enableDeclarationDisorder = enableDeclarationDisorder
    }

    fromClass<T>(clazz: Class<T>, { dependencies = [], name, lifeCycle = LifeCycle.Transient }: FromClassOptions = {}): ContainerBuilderInterface {
        const serviceName = name ?? clazz.name
        const fn = (...params: any[]) => new clazz(...params)

        return this.fromFactory(
            fn,
            { name: serviceName, lifeCycle, dependencies }
        )
    }

    fromFactory<T extends DefaultServiceFactory>(fn: T, { name, dependencies = [], lifeCycle = LifeCycle.Transient }: FromFactoryOptions): ContainerBuilderInterface {
        if (this.classes.has(name)) {
            throw new ServiceAlreadyRegisteredError(name)
        }

        const missingDependencies = dependencies
            ?.filter(dependency => !this.classes.has(serviceNameOrConstructorToString(dependency))) ?? []

        if (!this.enableDeclarationDisorder && missingDependencies.length > 0) {
            throw new NoServiceFoundError(missingDependencies)
        }

        const factory = createInstantiableFactory(lifeCycle).fromFunction(fn)

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
