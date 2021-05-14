# Usages

## Adding synchronous dependencies

In the following example, we declare two services as classes: `MyService` and `OtherService`.
Containers are built by using a container builder.

```typescript
import {createContainerBuilder, LifeCycle, SyncServiceProviderInterface} from '@botlfx/dependency-injection-container'

class MyService {
}

class OtherService {
    constructor(private myService: MyService) {
    }
}

// Create a container builder
const containerBuilder = createContainerBuilder()

// Add sync factories to the container
containerBuilder.addFactory("other-service", OtherService, LifeCycle.Singleton)

containerBuilder.addFactory(
    "my-service",
    (provider: SyncServiceProviderInterface) => new MyService(provider.get<OtherService>('other-service')),
    LifeCycle.Singleton
)

// Build the container
const container = containerBuilder.build()

// Use the container
const myService = container.get<MyService>("my-service")
const anotherService = container.get<OtherService>("other-service")
```

## Using constructors

Since `OtherService` and `MyService` are classes you can add them to the container with the method
`addConstructor`.

```typescript
import {createContainerBuilder, LifeCycle, SyncServiceProviderInterface} from '@botlfx/dependency-injection-container'

class OtherService {}

class MyService {
    private readonly otherService: OtherService
    
    constructor(provider: SyncServiceProviderInterface) {
        this.otherService = provider.get<OtherService>("other-service")
    }
}

// Create a container builder
const containerBuilder = createContainerBuilder()

// Add a sync constructor
containerBuilder.addConstructor("other-service", OtherService, LifeCycle.Singleton)

// We inject MyService as a constructor instead of a factory.
// The constructor will get the provider as first paramter.
containerBuilder.addConstructor(
    "my-service", 
    MyService, 
    LifeCycle.Singleton
)
```

> Note: Under the hood, `addConstructor` will make a call to `addFactory` by creating a simple factory like this `provider => new MyService(provider)`

## Service keys

In the previous example we used `string` to specify our service keys. You can use other types to
specify your keys.

```typescript
// The ServiceKey type as defined in the @botlfx/dependency-injection-container
type ServiceKey = string | number | Symbol

// You can use symbols
const k1: ServiceKey = Symbol("my service")

// You can use strings
const k2: ServiceKey = "my service"

// You can use numbers
const k3: ServiceKey = 2

// You can use an enum since it is represented as a number
enum ServiceKeys1 {
    MyService
}

const k4: ServiceKey = ServiceKeys1.MyService

// Same with "strings" enums.
enum ServiceKeys2 {
    MyService = "my service"
}

const k5: ServiceKey = ServiceKeys2.MyService
```

## Service lifecycle

In previous examples we add our services as singleton with `LifeCycle.Singleton`.
`LifeCycle` is an enum that help us specify our services' life cycles.

There are two life cycles available:
- `LifeCycle.Singleton` only one instance of the service will be created no matter how many times you call `get` or `getAsync`.
- `LifeCycle.Transient` gives you a new instance of the service every time you call `get` or `getAsync`.

```typescript
import {createContainerBuilder, LifeCycle} from '@botflx/dependency-injection-container'

const builder = createContainerBuilder()

builder.addConstructor('my-service', MyService, LifeCycle.Singleton)
builder.addConstructor('another-service', AnotherService, LifeCycle.Transient)

const container = builder.build()

expect(container.get('my-service')).toBe(container.get('my-service'))
expect(container.get('another-service')).not.toBe(container.get('another-service'))
```

## Adding asynchronous dependencies

You can also inject dependencies using async factories. In the following example we will use two services.
One that fetch a configuration, and the other will connect to a database.

```typescript
type Config = { dbUri: string }

class ConfigurationLoader {
    load(): Promise<Config> {
        // ... fetch the configuration from file
    }
}

class DbConnection {
    constructor(private readonly config: Config) {}
}
```

```typescript
import {createContainerBuilder, LifeCycle, AsyncServiceProviderInterface} from '@botflx/dependency-injection-container'

const builder = createContainerBuilder()

// We add the service as an async factory.
builder.addAsyncFactory('config', () => new ConfigurationLoader().load(), LifeCycle.Singleton)

// We use the previously injected service.
builder.addAsyncFactory(
    'connection', 
    async (provider: AsyncServiceProviderInterface) => {
        const config = await provider.getAsync<Config>('config')
        return new DbConnection(config)
    },
    LifeCycle.Singleton
)

// Create the container
const container = builder.build()

// Fetch the service
const connection = await container.getAsync<Connection>('connection')
```

When calling `addAsyncFactory` you need to pass an async factory instead of a sync factory.
This async factory must return a `Promise` of the service. The first parameter of the factory
is also different from the `addFactory` which is sync.

You can access sync services from an async factory, in fact the
`AsyncServiceProviderInterface` extends the `SyncServiceProviderInterface`.

## Service providers

In the previous example we used two interfaces to retrieve services' dependencies:
- `AsyncServiceProviderInterface` for async dependencies
- `SyncServiceProviderInterface` for sync dependencies

The reason we use those interface instead of the `ContainerInterface` directly is to ensure
that services added using the sync methods can't access async services, this way no sync services
can depend on async services.

Here is the declaration of those two interfaces.

```typescript
export interface SyncServiceProviderInterface {
    get<TService>(key: ServiceKey): TService
    has(key: ServiceKey): boolean
}

// Async service provider are sync service provider
export interface AsyncServiceProviderInterface extends SyncServiceProviderInterface {
    getAsync<TService>(key: ServiceKey): Promise<TService>
    hasAsync(key: ServiceKey): boolean
}
```

> This provider interface will possibly be replaced by a proxy system
> that allows object destructuring.

## Service loaders

When bootstrapping your container you can end up with a huge file 
with a lot of factory definition even if you extract factories in other files.

To resolve this issue, you can use service loaders. A service loader is just
a function taking as first parameter a container builder and returning void.

```typescript
import {ServiceLoaderInterface, LifeCycle, createContainerBuilder} from '@botflx/dependency-injection-container'

// Declare a service loader
const myLoader: ServiceLoaderInterface = builder => {
    builder.addFactory('other service', () => new OtherService(), LifeCycle.Singleton)
    builder.addFactory('my service', () => new MyService(), LifeCycle.Singleton)
}

// Give the loader to a container builder
const builder = createContainerBuilder({
    loaders: [ myLoader ]
})

// Build the container
const container = builder.build()

// Retrieve the service
const myService = container.get<MyService>("my service")
```

## Decorators

You can also use decorators to build your declare your services with a loader.

```typescript
import {
    createContainerBuilder,
    reflectServiceLoader,
    Service,
    Inject,
    LifeCycle
} from '@botflx/dependency-injection-container'

@Service("my service", LifeCycle.Singleton)
class MyService {
    constructor(@Inject("other service") otherService: OtherService) {}
}

@Service("other service", LifeCycle.Singleton)
class OtherService {
}

const builder = createContainerBuilder({
    loaders: [ reflectServiceLoader([ OtherService, MyService ]) ]
})

const container = builder.build()

const myService = container.get<MyService>("my service")
```

## Scoped container

Sometimes you want your container so be used only for a given http request.
You can create those kinds of container as following:

```typescript
import {createContainerBuilder, createScopedContainerBuilder, LifeCycle} from '@botflx/dependency-injection-container'

// Create a global container
const globalContainer = createContainerBuilder()
    .addFactory('foo', () => 'foo', LifeCycle.Singleton)
    .addFactory('bar', () => 'bar', LifeCycle.Singleton)
    .build()

// Create a container builder from the global container
const perRequestBuilder = createScopedContainerBuilder(globalContainer)
    .addFactory('foobar', provider => `${provider.get('foo')}${provider.get('bar')}`, LifeCycle.Singleton)

// Create a container per request.
const perRequestContainer1 = perRequestBuilder.build()
const perRequestContainer2 = perRequestBuilder.build()
const perRequestContainer3 = perRequestBuilder.build()
```
