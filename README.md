[![Build Status](https://travis-ci.com/botflux/random-di.svg?branch=main)](https://travis-ci.com/botflux/random-di)
[![npm version](https://img.shields.io/npm/v/@random-di%2Fcontainer.svg)](https://npmjs.org/package/@random-di/container)
[![Coverage Status](https://coveralls.io/repos/github/botflux/random-di/badge.svg?branch=main)](https://coveralls.io/github/botflux/dependency-injection-container?branch=main)
[![Lightweight](https://img.shields.io/bundlephobia/minzip/@random-di/random-di)](https://bundlephobia.com/result?p=@random-di/container)
[![GitHub issues](https://img.shields.io/github/issues/botflux/random-di.svg)](https://GitHub.com/botflux/random-di/issues/)
[![GitHub license](https://img.shields.io/github/license/botflux/random-di.svg)](https://github.com/botflux/random-di/blob/main/LICENCE)

> In software engineering, dependency injection is a technique in which an object receives other objects that it depends on. These other objects are called dependencies. [Source Wikipedia](https://en.wikipedia.org/wiki/Dependency_injection)

`@random-di/container` helps you register your applications dependencies
by providing a dependency injection container.

## Installation

```shell script
npm i --save @random-di/container
```

```shell
yarn add @random-di/container
```

## Usage

```typescript
import {createContainerBuilder, LifeCycle} from '@random-di/container'

// Declare some services
class ServiceA {
}

class ServiceB {
    constructor(serviceA: ServiceA) {}
}

// Construct the container using a container builder
const builder = createContainerBuilder()
    .addFactory('serviceA', () => new ServiceA(), LifeCycle.Singleton)
    .addFactory(
        'serviceB', 
        provider => new ServiceB(provider.get<ServiceA>('serviceB')), 
        LifeCycle.Transient
    )

// Build the container
const container = builder.build()

// Retrieve the services
const serviceA = container.get<ServiceA>('serviceA')
const serviceB = container.get<ServiceB>('serviceB')
```

## Docs

[https://botflux.github.io/random-di](https://botflux.github.io/random-di)
