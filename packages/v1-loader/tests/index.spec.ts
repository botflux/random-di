import {createServiceContainer} from '@botflx/dependency-injection-container'
import {createContainerBuilder, SyncServiceProviderInterface} from '@random-di/container'
import {v1Loader} from '../src'

class ServiceA {
    public hello: string

    constructor(provider: SyncServiceProviderInterface) {
        this.hello = provider.get<string>('hello')
    }
}

let i = 0

class ServiceB {
    public i: number
    constructor() {
        this.i = i++
    }
}

describe('#v1Loader', function () {
    it('should load v1 container dependencies', function () {
        // Arrange
        const v1Container = createServiceContainer()
            .addFactory('hello', () => 'world')
            .add('ServiceA', ServiceA)

        // Act
        const v2Container = createContainerBuilder({
            loaders: [ v1Loader(v1Container) ]
        }).build()

        const hello = v2Container.get<string>('hello')
        const serviceA = v2Container.get<ServiceA>('ServiceA')

        // Assert
        expect(hello).toBe('world')
        expect(serviceA.hello).toEqual('world')
        expect(serviceA).toBeInstanceOf(ServiceA)
    })

    it('should register services as singleton', function () {
        // Arrange
        const v1Container = createServiceContainer()
            .add('serviceB', ServiceB)

        const v2Container = createContainerBuilder({
            loaders: [ v1Loader(v1Container) ]
        }).build()

        // Act
        const serviceB1 = v2Container.get<ServiceB>("serviceB")
        const serviceB2 = v2Container.get<ServiceB>("serviceB")

        // Assert
        expect(serviceB1.i).toBe(0)
        expect(serviceB2.i).toBe(0)
    })
})
