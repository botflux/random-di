import { DbConnection, UserRepository } from "../Services"
import { LifeCycle, LifeCycleKind } from "./Lifecycle.spec"
import {DirectedAcyclicGraph, NoNeighbourError} from '../../src/Implementation/DirectedAcyclicGraph'

type ServiceFactory<TService, TArgs extends Array<any>> = (...args: TArgs) => TService
type Service<TService, TArgs extends Array<any>> = {
    factory: ServiceFactory<TService, TArgs>,
    lifeCycle: LifeCycleKind<TService>,
    dependencies: string[]
}

type ResolvedServiceFactory<TService> = () => TService

interface ServiceResolverInterface {
    addDependency<TService, TArgs extends Array<any>>(serviceName: string, service: Service<TService, TArgs>): this
    resolve<T>(serviceName: string): ResolvedServiceFactory<T>
}

class DependencyNotFoundError extends Error {
    constructor(serviceName: string, dependencyOf: string) {
        super(`Service ${serviceName} needs the service ${dependencyOf} in order to be instantiated but ${dependencyOf} doesn't exist.`);
    }
}

class ServiceResolver implements ServiceResolverInterface {
    private readonly dependencyGraph: DirectedAcyclicGraph<string, Service<any, any>> =
        new DirectedAcyclicGraph()

    resolve<T>(serviceName: string): ResolvedServiceFactory<T> {
        return () => {
            const vertex = this.dependencyGraph.getVertexStrict(serviceName)
            const neighbours = vertex.neighbours
                .map(key => this.resolve(key))

            return vertex.value.factory(...neighbours.map(neighbour => neighbour()))
        }
    }

    addDependency<TService, TArgs extends Array<any>>(serviceName: string, service: Service<TService, TArgs>): this {
        try {
            this.dependencyGraph.addVertex(
                serviceName,
                service,
                service.dependencies
            )
        } catch (error) {
            if (error instanceof NoNeighbourError) {
                throw new DependencyNotFoundError(error.neighbour, error.parent)
            } else {
                throw error
            }
        }

        return this
    }
}

const createServiceResolver = (): ServiceResolverInterface => new ServiceResolver()

describe('service resolver', function () {
    it('should resolve services', function () {
        // Arrange
        const serviceResolver = createServiceResolver()

        serviceResolver.addDependency('dbConnection', {
            factory: () => new DbConnection(),
            lifeCycle: LifeCycle.Singleton,
            dependencies: []
        })

        serviceResolver.addDependency<UserRepository, [DbConnection]>('userRepository', {
            factory: (connection: DbConnection) => new UserRepository(connection),
            lifeCycle: LifeCycle.Transient,
            dependencies: [ 'dbConnection' ]
        })

        // Act
        const instantiate = serviceResolver.resolve('userRepository')
        const instance = instantiate()

        // Assert
        expect(instance).toBeInstanceOf(UserRepository)
    })

    it('should throw a dependency not found error', () => {
        // Arrange
        const serviceResolver = createServiceResolver()

        // Act
        const shouldThrow = () => serviceResolver.addDependency<UserRepository, [DbConnection]>('userRepository', {
            factory: (connection: DbConnection) => new UserRepository(connection),
            lifeCycle: LifeCycle.Transient,
            dependencies: [ 'dbConnection' ]
        })

        // Assert
        expect(shouldThrow).toThrow(DependencyNotFoundError)
    })

    it.todo('should throw when a singleton service requires a transient service')
})
