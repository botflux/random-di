import {
    DefaultServiceFactory,
    DestroyableService,
    InstantiatableService,
    ValidatableService
} from './InstantiatableService'
import {isSyncPromise, SyncPromise} from '../SyncPromise'

/**
 * A simple type util to get the wrapped type of a promise.
 * If the type is not a Promise then it return the type.
 */
export type Unpromisify<T> = T extends Promise<infer U> ? U : T

/**
 * A function type used for invalidating a singleton instance.
 */
export type InvalidateSingletonServiceInstance<Service> = (service: Service) => boolean

/**
 * A function type used for repairing an invalid singleton instance.
 *
 * @see {InvalidateSingletonServiceInstance}
 */
export type RepairSingletonServiceInstance<Service> = (service: Service extends Promise<infer InnerService> ? InnerService : Service) => Service extends Promise<infer InnerService>
    ? InnerService | Promise<InnerService>
    : Service

/**
 * A function type used for destroying a singleton instance.
 *
 * @see {SingletonService#destroy}
 */
export type DestroySingletonServiceInstance<Service> = (service: Service extends Promise<infer InnerService> ? InnerService : Service) => void

/**
 * Parameters type to instantiate a new SingletonService instance.
 *
 * @see SingletonService#constructor
 */
export type SingletonServiceParameters<ServiceFactory extends DefaultServiceFactory> = {
    factory: ServiceFactory,
    invalidate?: InvalidateSingletonServiceInstance<Unpromisify<ReturnType<ServiceFactory>>>,
    repair?: RepairSingletonServiceInstance<ReturnType<ServiceFactory>>,
    destroy?: DestroySingletonServiceInstance<ReturnType<ServiceFactory>>
}

/**
 * Default function for invalidating singleton service instance.
 * This constant is used as a default value when there is no "invalidate" function specified.
 *
 * @param service
 * @see SingletonServiceParameters#invalidate
 * @see SingletonService#instantiate
 */
const defaultInvalidateSingletonServiceInstance = (service: any) => false

/**
 * A singleton (sync or async) service lifecycle.
 * This implementation handles both sync and async services.
 * To do so, we use a "SyncPromise" for aligning behaviour.
 */
export class SingletonService<ServiceFactory extends DefaultServiceFactory> implements
    InstantiatableService<ServiceFactory>,
    DestroyableService<ServiceFactory>,
    ValidatableService<ServiceFactory> {

    private dependents: ValidatableService<any>[] = []

    /**
     * The currently instantiated service.
     * Since services can be sync or async, we need to un-promisify the service type.
     * We "re-promise it" with a PromiseLike (SyncPromise or Promise).
     *
     * @private
     */
    private instantiatedService: PromiseLike<Unpromisify<ReturnType<ServiceFactory>> | undefined> = SyncPromise.from(undefined)

    constructor(private readonly params: SingletonServiceParameters<ServiceFactory>) {}

    /**
     * This function instantiate or load from cache a new singleton instance.
     * In order to simplify and handle both async and sync in the same place,
     * we use a wrapper around sync service {@see SyncPromise}.
     *
     * @param params
     */
    instantiate(...params: Parameters<ServiceFactory>): ReturnType<ServiceFactory> {
        const invalidate = this.params.invalidate ?? defaultInvalidateSingletonServiceInstance

        const isInvalidPromise = this.instantiatedService.then(
            innerService => innerService ? invalidate(innerService) : false
        )

        const reInstantiatedServicePromise = SyncPromise.all(isInvalidPromise, this.instantiatedService).then(
            ([isInvalid, instance]) => isInvalid
                // @ts-ignore
                ? this.params.repair ? this.params.repair(instance) : this.params.factory(...params)
                : undefined
        )

        const instancePromise = SyncPromise.all(this.instantiatedService, reInstantiatedServicePromise).then(
            ([instantiated, reInstantiated]) => reInstantiated ?? instantiated ?? this.params.factory(...params)
        )

        this.instantiatedService = instancePromise

        return isSyncPromise(instancePromise)
            ? instancePromise.unwrap()
            : instancePromise
    }

    destroy(): ReturnType<ServiceFactory> extends Promise<infer Service> ? Promise<void> : void {
        const destroyPromise = this.instantiatedService.then(service => {
            const destroyFunction = this.params.destroy ?? (() => {})

            if (service) {
                return destroyFunction(service)
            }
        })

        return destroyPromise instanceof SyncPromise
            ? destroyPromise.unwrap()
            : destroyPromise.then(() => {})
    }

    invalidate(): ReturnType<ServiceFactory> extends Promise<any> ? Promise<void> : void {
        const invalidatePromise = this.instantiatedService.then(instance => {
            if (this.isInvalidated()) {
                this.instantiatedService = SyncPromise.from(undefined)
            }

            return undefined
        })

        const result = isSyncPromise(invalidatePromise)
            ? invalidatePromise.unwrap()
            : invalidatePromise

        return result as unknown as ReturnType<ServiceFactory> extends Promise<any> ? Promise<void> : void
    }

    isInvalidated(): ReturnType<ServiceFactory> extends Promise<any> ? Promise<boolean> : boolean {
        const isInvalidatedPromise = this.instantiatedService.then(instance => {
            if (!instance) return false
            if (!this.params.invalidate) return false
            return this.params.invalidate(instance)
        })

        const result = isSyncPromise(isInvalidatedPromise)
            ? isInvalidatedPromise.unwrap()
            : isInvalidatedPromise

        return result as unknown as ReturnType<ServiceFactory> extends Promise<any> ? Promise<boolean> : boolean
    }
}
