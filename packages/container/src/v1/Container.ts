import {DirectedAcyclicGraph} from './DirectedAcyclicGraph'
import {InstantiatableService} from './LifeCycle/InstantiatableService'
import {isSyncPromise, SyncPromise} from './SyncPromise'
import {ServiceAlreadyRegisteredError} from '../v0'
import {TransientService} from './LifeCycle/TransientService'
import {SingletonService} from './LifeCycle/SingletonService'

export type Singleton = 'Singleton'
export type Transient = 'Transient'
type LifeCycleKind = Singleton | Transient
export const LifeCycle = {
    Singleton: 'Singleton' as Singleton,
    Transient: 'Transient' as Transient
}

interface ContainerInterface {
    get<Service>(serviceName: string): Service

    getAsync<Service>(serviceName: string): Promise<Service>
}

class Container implements ContainerInterface {
    constructor(
        private readonly dependencyGraph: DirectedAcyclicGraph<string, InstantiatableService<any>>
    ) {
    }

    get<Service>(serviceName: string): Service {
        if (!this.dependencyGraph.isVertexExisting(serviceName)) {
            throw new Error('Service does not exist.')
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

    getAsync<Service>(serviceName: string): Promise<Service> {
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

export class DependencyNotFoundError extends Error {
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
    ) {
    }

    addService<ServiceFactory extends DefaultServiceFactory>(options: ServiceOptions<ServiceFactory>): this {
        const {dependsOn = [], lifeCycle = LifeCycle.Singleton} = options

        if (this.dependencyGraph.isVertexExisting(options.name)) {
            throw new ServiceAlreadyRegisteredError(options.name)
        }

        const service = lifeCycle === 'Transient'
            ? new TransientService({factory: options.factory})
            : new SingletonService({factory: options.factory})

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

export const createContainerBuilder = (): ContainerBuilderInterface => new ContainerBuilder()
