import {
    AsyncServiceProviderInterface,
    ServiceKey,
    ServiceNotFoundError,
    SyncServiceProviderInterface
} from '../Interfaces'

export function provideSync<TService>(factory: (...args: any[]) => TService, servicesKeys: ServiceKey[]) {
    return function (provider: SyncServiceProviderInterface) {
        const factoryArguments = servicesKeys.map(key => {
            if (provider.has(key)) {
                return provider.get(key)
            } else {
                throw new ServiceNotFoundError(key)
            }
        })

        return factory(...factoryArguments)
    }
}

export function provideAsync<TService>(factory: (...args: any[]) => TService, servicesKeys: ServiceKey[]) {
    return async function (provider: AsyncServiceProviderInterface) {
        const factoryArguments = await Promise.all(servicesKeys.map(key => {
            if (provider.hasAsync(key)) {
                return provider.getAsync(key)
            } else if (provider.has(key)) {
                return Promise.resolve(provider.get(key))
            } else {
                return Promise.reject(new ServiceNotFoundError(key))
            }
        }))

        return factory(...factoryArguments)
    }
}
