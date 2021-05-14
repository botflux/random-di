# Getting started

> This documentation only cover the `v2` of this package which is
> in beta. `v2` has a lot of breaking changes.

[![Build Status](https://travis-ci.org/botflux/dependency-injection-container.svg?branch=master)](https://travis-ci.org/botflux/dependency-injection-container)
[![npm version](https://img.shields.io/npm/v/@botflx%2Fdependency-injection-container.svg)](https://npmjs.org/package/@botflx/dependency-injection-container)
[![Coverage Status](https://coveralls.io/repos/github/botflux/dependency-injection-container/badge.svg?branch=master)](https://coveralls.io/github/botflux/dependency-injection-container?branch=master)
[![Lightweight](https://img.shields.io/bundlephobia/minzip/@botflx/dependency-injection-container)](https://bundlephobia.com/result?p=@botflx/dependency-injection-container)
[![GitHub issues](https://img.shields.io/github/issues/botflux/dependency-injection-container.svg)](https://GitHub.com/botflux/dependency-injection-container/issues/)
[![GitHub license](https://img.shields.io/github/license/botflux/dependency-injection-container.svg)](https://github.com/botflux/dependency-injection-container/blob/master/LICENSE)

> In software engineering, dependency injection is a technique in which an object receives other objects that it depends on. These other objects are called dependencies. [Source Wikipedia](https://en.wikipedia.org/wiki/Dependency_injection)

This package exposes a dependency injection container that manage your
application dependencies.

## Simple example of dependency injection

The following example show some code without dependency injection.
We have two classes: `Engine` and `Car`. `Car` uses `Engine` in his `start` method.
In this example we can see that `Car` creates an `Engine` instance.

```typescript
class Engine {
    start() {
    }
}

class Car {
    private engine: Engine
    
    constructor() {
        // We create an instance of Engine
        this.engine = new Engine()
    }
    
    start() {
        this.engine.start()
    }
}

new Car().start()
```

When using dependency injection, our goal is to separate the creation and use of objects.
We can adapt the previous example to inject the dependency needed by `Engine` to work.

```typescript
class Engine {
    start() {
    }
}

class Car {
    private engine: Engine
    
    // We inject the Engine as a paramter of the constructor
    constructor(engine: Engine) {
        this.engine = engine
    }
    
    start() {
        this.engine.start()
    }
}

new Car(new Engine()).start()
```

At his core dependency injection is just this: separating object creation and object usage.
> Keep in mind that you don't need this package to do dependency injection in fact
> you can use plain javascript / typescript.

## Why use a package to do dependency injection ?

This package gives a lightweight container that will helps you manage your dependencies, and their
life cycles. It will give you tools to simplify the creation of all your application dependencies. 
This package tries to be simpler that other DI containers. If you are looking for a DI Container using a lot
of reflection and/or decorators you are not at the right place.

We can write the previous example with this package container.

```typescript
// classes.ts
class Engine {
    start() {
    }
}

class Car {
    private engine: Engine
    
    constructor(engine: Engine) {
        this.engine = engine    
    }
    
    start() {
        this.engine.start()
    }
}
```

```typescript
// bootstrap.ts
import {createContainerBuilder, LifeCycle} from '@botflx/dependency-injection-container'
import { Engine, Car } from './classes'

// Add your dependencies to the container as factory functions
const builder = createContainerBuilder()
    .addFactory('Engine', () => new Engine(), LifeCycle.Singleton)
    .addFactory('Car', provider => new Car(provider.get<Engine>('Engine')), LifeCycle.Singleton)

// Create the container
const container = builder.build()

// Fetch a dependency from the container
const car = container.get<Car>('Car')

car.start()
```

This example is more complexe than this previous because the container adds some features.

## Npm dependencies

This package is meant to be delivered without third-party dependencies.
If this package needs a feature enabled by a third-party package then
an extension will be developed outside this package so users do not
download unwanted dependencies.
