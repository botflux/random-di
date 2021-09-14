export type DefaultServiceFactory = (...params: any[]) => any

export interface InstantiatableService<ServiceFactory extends DefaultServiceFactory> {
    /**
     * Retrieve a service.
     * The actions performs depends on the implementation and lifecycle.
     *
     * @param params
     */
    instantiate(...params: Parameters<ServiceFactory>): ReturnType<ServiceFactory>
}

/**
 * Implemented by services that can be destroyed.
 */
export interface DestroyableService<ServiceFactory extends DefaultServiceFactory> {
    /**
     * Destroy the service.
     */
    destroy(): ReturnType<ServiceFactory> extends Promise<infer Service> ? Promise<void> : void
}
