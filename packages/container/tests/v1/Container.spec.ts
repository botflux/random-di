import {
    ArticleRepository,
    Configuration,
    ConfigurationLoader,
    DatabaseConnection,
    DbConnection,
    UserRepository
} from '../Services'
import {DirectedAcyclicGraph} from '../../src/v1/DirectedAcyclicGraph'
import {InstantiatableService} from '../../src/v1/LifeCycle/InstantiatableService'
import {TransientService} from '../../src/v1/LifeCycle/TransientService'
import {SingletonService} from '../../src/v1/LifeCycle/SingletonService'
import {isSyncPromise, SyncPromise} from '../../src/v1/SyncPromise'
import {ServiceAlreadyRegisteredError} from '../../src/v0'

type Singleton = "Singleton"
type Transient = "Transient"

type LifeCycleKind = Singleton | Transient

const LifeCycle = {
    Singleton: "Singleton" as Singleton,
    Transient: "Transient" as Transient
}

interface ContainerInterface {
    get<Service>(serviceName: string): Service
    getAsync<Service>(serviceName: string): Promise<Service>
}

class Container implements ContainerInterface {
    constructor(
        private readonly dependencyGraph: DirectedAcyclicGraph<string, InstantiatableService<any>>
    ) {}

    get<Service>(serviceName: string): Service {
        if (!this.dependencyGraph.isVertexExisting(serviceName)) {
            throw new Error("Service does not exist.")
        }

        const service = this.dependencyGraph.getVertexStrict(serviceName)
        const dependencies = service.neighbours.map(dependencyName => this.get(dependencyName))

        const isAnyDependencyAsync = dependencies.some(dependency => dependency instanceof Promise)
        const dependenciesPromise = isAnyDependencyAsync
            ? Promise.all(dependencies)
            : SyncPromise.allWithoutTypeChecking(dependencies.map(dependency =>
                dependency instanceof SyncPromise ? dependency : SyncPromise.from(dependency)))

        const serviceInstancePromise = dependenciesPromise.then(
            dependencies => service.value.instantiate(...dependencies)
        )

        return isSyncPromise(serviceInstancePromise)
            ? serviceInstancePromise.unwrap()
            : serviceInstancePromise
    }

    getAsync<Service> (serviceName: string): Promise<Service> {
        return this.get<Promise<Service>>(serviceName)
    }
}

type DefaultServiceFactory = (...params: any[]) => any

type ServiceOptions<ServiceFactory extends DefaultServiceFactory> = {
    name: string
    factory: ServiceFactory
    dependsOn?: string[]
    lifeCycle?: LifeCycleKind
}

interface ContainerBuilderInterface {
    addService<ServiceFactory extends DefaultServiceFactory>(options: ServiceOptions<ServiceFactory>): this
    build(): ContainerInterface
}

class DependencyNotFoundError extends Error {
    constructor(serviceName: string, dependencyName: string) {
        super(`Missing dependency ${dependencyName} for instantiating ${serviceName}.`
            + `Are you sure "${dependencyName}" is spelled correctly?`
            + `Is "${dependencyName}" registered?`
            + `Is "${dependencyName}" declared before? If not, you must declare it before.`
        )
    }
}

class ContainerBuilder implements ContainerBuilderInterface {
    constructor(
        private readonly dependencyGraph: DirectedAcyclicGraph<string, InstantiatableService<any>> = new DirectedAcyclicGraph()
    ) {}

    addService<ServiceFactory extends DefaultServiceFactory>(options: ServiceOptions<ServiceFactory>): this {
        const { dependsOn = [], lifeCycle = LifeCycle.Singleton } = options

        if (this.dependencyGraph.isVertexExisting(options.name)) {
            throw new ServiceAlreadyRegisteredError(options.name)
        }

        const service = lifeCycle === 'Transient'
            ? new TransientService({ factory: options.factory })
            : new SingletonService({ factory: options.factory })

        dependsOn.forEach(dependencyName => {
            if (!this.dependencyGraph.isVertexExisting(dependencyName)) {
                throw new DependencyNotFoundError(options.name, dependencyName)
            }
        })

        this.dependencyGraph.addVertex(
            options.name,
            service,
            options.dependsOn
        )

        return this
    }

    build(): ContainerInterface {
        return new Container(this.dependencyGraph)
    }
}

const createContainerBuilder = (): ContainerBuilderInterface => new ContainerBuilder()

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

