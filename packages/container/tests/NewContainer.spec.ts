import {DbConnection, UserRepository} from './Services'
import {DefaultServiceFactory, InstantiatableService} from '../src/LifeCycle/InstantiatableService'
import {SingletonService, SingletonServiceParameters} from '../src/LifeCycle/SingletonService'
import {ServiceFactory} from '../src'
import {DirectedAcyclicGraph} from '../src/DirectedAcyclicGraph'
import {TransientService} from '../src/LifeCycle/TransientService'
import {SyncPromise} from '../src/SyncPromise'

class Service<ServiceFactory extends DefaultServiceFactory, LifeCycle extends LifeCycleType<ServiceFactory> = TransientLifeCycleType> {
    constructor(
        public readonly name: string,
        public factory: ServiceFactory,
        public dependsOn: string[] = [],
        public lifeCycle: LifeCycleType<ServiceFactory> = 'transient'
    ) {
    }

    static withName(name: string): Service<() => undefined> {
        return new Service<() => undefined>(
            name,
            () => undefined
        )
    }

    withFactory<ServiceFactory extends DefaultServiceFactory> (factory: ServiceFactory): Service<ServiceFactory> {
        return new Service<ServiceFactory>(
            this.name,
            factory,
            this.dependsOn,
            (this.lifeCycle ?? 'transient') as LifeCycleType<ServiceFactory>
        )
    }

    duplicate(): Service<ServiceFactory> {
        return new Service<ServiceFactory>(
            this.name,
            this.factory,
            this.dependsOn,
            this.lifeCycle
        )
    }

    withDependencies(dependencies: string[]): this {
        this.dependsOn = dependencies
        return this
    }

    withLifeCycle<LifeCycle extends LifeCycleType<ServiceFactory>>(lifeCycle: LifeCycleType<ServiceFactory>): Service<ServiceFactory, LifeCycle> {
        this.lifeCycle = lifeCycle
        return this
    }
}

type TransientLifeCycleType = 'transient'
type SingletonLifeCycleType<ServiceFactory extends DefaultServiceFactory> = Omit<SingletonServiceParameters<ServiceFactory>, 'factory'>
    & { type: 'singleton' }

type LifeCycleType<ServiceFactory extends DefaultServiceFactory> =
    | TransientLifeCycleType
    | SingletonLifeCycleType<ServiceFactory>


const LifeCycle = {
    Transient: 'transient' as TransientLifeCycleType,
    newSingleton<ServiceFactory extends DefaultServiceFactory>(parameters: Omit<SingletonServiceParameters<ServiceFactory>, 'factory'>): SingletonLifeCycleType<ServiceFactory> {
        return { type: 'singleton', ...parameters }
    },
    Singleton: {
        type: 'singleton'
    } as SingletonLifeCycleType<any>
}

class NewContainer {
    constructor(private readonly graph: DirectedAcyclicGraph<string, InstantiatableService<any>>) {}

    get<Service>(serviceName: string): Service {
        const vertex = this.graph.getVertexStrict(serviceName)
        const dependencies = vertex.neighbours.map(neighbour => this.get(neighbour))

        const hasAsyncDependency = dependencies.some(value => value instanceof Promise)

        const promisifiedDependencies = hasAsyncDependency
            ? dependencies.map(dependency => dependency instanceof Promise ? dependency : Promise.resolve(dependency))
            : dependencies.map(dependency => SyncPromise.from(dependency))

        const allDependenciesPromise = SyncPromise.allWithoutTypeChecking(promisifiedDependencies)
        const service = allDependenciesPromise.then(
            dependencies => vertex.value.instantiate(...dependencies)
        )

        return service instanceof SyncPromise
            ? service.unwrap()
            : service
    }

    getAsync<Service> (serviceName: string): Promise<Service> {
        return this.get(serviceName)
    }
}

class NewContainerBuilder {
    private readonly graph = new DirectedAcyclicGraph<string, InstantiatableService<any>>()

    addService<ServiceFactory extends DefaultServiceFactory>(service: Service<ServiceFactory>): this {
        return service.lifeCycle === 'transient'
            ? this.addTransient(service)
            : this.addSingleton(service)
    }

    build(): NewContainer {
        return new NewContainer(this.graph)
    }

    private addSingleton<ServiceFactory extends DefaultServiceFactory, S extends Service<ServiceFactory, SingletonLifeCycleType<ServiceFactory>>>(service: S): this {
        const singletonService = new SingletonService(service)
        this.graph.addVertex(service.name, singletonService, service.dependsOn)
        return this
    }

    private addTransient<ServiceFactory extends DefaultServiceFactory, S extends Service<ServiceFactory, TransientLifeCycleType>> (service: S): this {
        const transientService = new TransientService(service)
        this.graph.addVertex(service.name, transientService, service.dependsOn)
        return this
    }
}

type AddSingletonOptions<ServiceFactory extends DefaultServiceFactory> = {
    name: string,
    factory: ServiceFactory
    dependencies?: string[],
} & Omit<SingletonLifeCycleType<ServiceFactory>, 'type'>

type AddTransientOptions<ServiceFactory extends DefaultServiceFactory> = {
    name: string,
    factory: ServiceFactory,
    dependencies?: string[]
}

class ObjectSyntaxContainerBuilder {
    private readonly builder = new NewContainerBuilder()

    addSingleton<ServiceFactory extends DefaultServiceFactory>(options: AddSingletonOptions<ServiceFactory>): this {
        this.builder.addService(
            Service.withName(options.name)
                .withFactory(options.factory)
                .withDependencies(options.dependencies ?? [])
                .withLifeCycle({ ...options, type: 'singleton' })
        )

        return this
    }

    addTransient<ServiceFactory extends DefaultServiceFactory> (options: AddTransientOptions<ServiceFactory>): this {
        this.builder.addService(
            Service.withName(options.name)
                .withFactory(options.factory)
                .withDependencies(options.dependencies ?? [])
                .withLifeCycle(LifeCycle.Transient)
        )

        return this
    }

    build(): NewContainer {
        return this.builder.build()
    }
}

describe('container usage', function () {
    it('should instantiate services', function () {
        // Arrange
        const container = new NewContainerBuilder()
            .addService(
                Service
                    .withName('dbConnection')
                    .withFactory(() => new DbConnection())
                    .withDependencies([])
                    .withLifeCycle(LifeCycle.newSingleton({
                        destroy: service => service.disconnect(),
                    }))
            )
            .addService(
                Service
                    .withName('userRepository')
                    .withFactory((dbConnection: DbConnection) => new UserRepository(dbConnection))
                    .withDependencies([ 'dbConnection' ])
                    .withLifeCycle(LifeCycle.Transient)
            )
            .build()

        // Act
        const userRepository1 = container.get('userRepository')
        const userRepository2 = container.get('userRepository')
        const dbConnection1 = container.get('dbConnection')
        const dbConnection2 = container.get('dbConnection')

        // Assert
        expect(userRepository1).not.toBe(userRepository2)
        expect(userRepository1).toBeInstanceOf(UserRepository)
        expect(userRepository2).toBeInstanceOf(UserRepository)
        expect(dbConnection1).toBe(dbConnection2)
        expect(dbConnection1).toBeInstanceOf(DbConnection)
        expect(dbConnection2).toBeInstanceOf(DbConnection)
    })

    it('should instantiate services including the async one', async function () {
        // Arrange
        const container = new NewContainerBuilder()
            .addService(
                Service
                    .withName('dbConnection')
                    .withFactory(async () => new DbConnection())
                    .withLifeCycle(LifeCycle.Singleton)
            )
            .addService(
                Service
                    .withName('userRepository')
                    .withFactory((dbConnection: DbConnection) => new UserRepository(dbConnection))
                    .withDependencies(['dbConnection'])
                    .withLifeCycle(LifeCycle.Transient)
            )
            .build()

        // Act
        const userRepository1 = await container.getAsync<UserRepository>('userRepository')
        const userRepository2 = await container.getAsync<UserRepository>('userRepository')
        const dbConnection1 = await container.getAsync<DbConnection>('dbConnection')
        const dbConnection2 = await container.getAsync<DbConnection>('dbConnection')

        // Assert
        expect(userRepository1).not.toBe(userRepository2)
        expect(userRepository1).toBeInstanceOf(UserRepository)
        expect(userRepository2).toBeInstanceOf(UserRepository)
        expect(dbConnection1).toBe(dbConnection2)
        expect(dbConnection1).toBeInstanceOf(DbConnection)
        expect(dbConnection2).toBeInstanceOf(DbConnection)
    })
})

describe('container usage with object syntax', function () {
    it('should instantiate services', function () {
        // Arrange
        const container = new ObjectSyntaxContainerBuilder()
            .addSingleton({
                name: 'dbConnection',
                factory: () => new DbConnection()
            })
            .addTransient({
                name: 'userRepository',
                dependencies: [ 'dbConnection' ],
                factory: (dbConnection: DbConnection) => new UserRepository(dbConnection)
            })
            .build()

        // Act
        const userRepository1 = container.get('userRepository')
        const userRepository2 = container.get('userRepository')
        const dbConnection1 = container.get('dbConnection')
        const dbConnection2 = container.get('dbConnection')

        // Assert
        expect(userRepository1).not.toBe(userRepository2)
        expect(userRepository1).toBeInstanceOf(UserRepository)
        expect(userRepository2).toBeInstanceOf(UserRepository)
        expect(dbConnection1).toBe(dbConnection2)
        expect(dbConnection1).toBeInstanceOf(DbConnection)
        expect(dbConnection2).toBeInstanceOf(DbConnection)
    })
})
