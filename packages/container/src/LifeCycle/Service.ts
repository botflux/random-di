export type DefaultServiceFactory = (...params: any[]) => any

export interface Service<ServiceFactory extends DefaultServiceFactory> {
    /**
     * Retrieve a service.
     * The actions performs depends on the implementation and lifecycle.
     *
     * @param params
     */
    retrieve(...params: Parameters<ServiceFactory>): ReturnType<ServiceFactory>
}
