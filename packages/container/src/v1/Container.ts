import {DirectedAcyclicGraph} from './DirectedAcyclicGraph'
import {DefaultServiceFactory, InstantiatableService, isValidatableService} from './LifeCycle/InstantiatableService'
import {isSyncPromise, SyncPromise} from './SyncPromise'
import {ServiceAlreadyRegisteredError, ServiceFactory} from '../v0'
import {TransientService} from './LifeCycle/TransientService'
import {SingletonService, SingletonServiceParameters} from './LifeCycle/SingletonService'

/**
 * Singleton service type.
 */
export type Singleton<ServiceFactory extends DefaultServiceFactory> =
    & Omit<SingletonServiceParameters<ServiceFactory>, 'factory'>
    & { type: 'Singleton' }

/**
 * Transient service type.
 */
export type Transient = 'Transient'

export type LifeCycleKind<ServiceFactory extends DefaultServiceFactory> =
    | Singleton<ServiceFactory>
    | Transient

export const LifeCycle = {
    Singleton: { type: 'Singleton' } as Singleton<any>,
    Transient: 'Transient' as Transient,
    newSingleton: <ServiceFactory extends DefaultServiceFactory>(options: Omit<SingletonServiceParameters<ServiceFactory>, 'factory'>) => ({
        type: 'Singleton',
        ...options
    }) as Singleton<ServiceFactory>
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
        const dependencies = this.dependencyGraph
            .getNeighbours(serviceName)
            .map(dependencyName => this.get(dependencyName.key))

        // Get all the dependent services

        const isAnyDependencyAsync = dependencies.some(dependency => dependency instanceof Promise)
        // isAnyDependentInvalid

        // if any dependent then invalidate the service

        const dependenciesPromise = isAnyDependencyAsync
            ? Promise.all(dependencies)
            : SyncPromise.allWithoutTypeChecking(dependencies)

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

type ServiceOptions<ServiceFactory extends DefaultServiceFactory> = {
    name: string
    factory: ServiceFactory
    dependsOn?: string[]
    lifeCycle?: LifeCycleKind<ServiceFactory>
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
            ? new TransientService({ factory: options.factory })
            : new SingletonService({ factory: options.factory, ...lifeCycle })

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
