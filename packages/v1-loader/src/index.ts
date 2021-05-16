import {IServiceContainer, ReflectServiceContainer, ServiceContainer} from '@botflx/dependency-injection-container'
import {LifeCycle, ServiceLoaderInterface} from '@random-di/container'

export const v1Loader = (container: IServiceContainer): ServiceLoaderInterface => containerBuilder => {
    if (container instanceof ReflectServiceContainer || container instanceof ServiceContainer) {
        for (const serviceKey in container.factories) {
            containerBuilder.addFactory(
                serviceKey,
                // We need to add this ts-ignore because the factory function type of v1 is not the same a v2.
                // The v1 takes a container which as more methods that the v2 which takes a provider.
                // @ts-ignore
                container.factories[serviceKey],
                LifeCycle.Singleton
            )
        }
    }
}
