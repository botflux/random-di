import {DefaultServiceFactory, InstantiatableService} from './InstantiatableService'

/**
 * Represents parameters needed to construct a new {@see TransientService}.
 *
 * @see TransientService#constructor
 */
export type TransientServiceParameters<ServiceFactory extends DefaultServiceFactory> = {
    factory: ServiceFactory
}

/**
 * A service with a transient lifecycle.
 * Each time {@see TransientService#instantiate} is called, a new instance is created.
 * This implementation *never* cache the instantiated services.
 */
export class TransientService<ServiceFactory extends DefaultServiceFactory> implements InstantiatableService<ServiceFactory> {
    constructor(private readonly params: TransientServiceParameters<ServiceFactory>) {}

    instantiate(...params: Parameters<ServiceFactory>): ReturnType<ServiceFactory> {
        return this.params.factory(...params)
    }
}
