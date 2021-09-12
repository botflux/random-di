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

