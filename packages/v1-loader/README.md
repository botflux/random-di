[![Build Status](https://travis-ci.com/botflux/random-di.svg?branch=main)](https://travis-ci.com/botflux/random-di)
[![npm version](https://img.shields.io/npm/v/@random-di%2Fv1-loader.svg)](https://npmjs.org/package/@random-di/v1-loader)
[![Coverage Status](https://coveralls.io/repos/github/botflux/random-di/badge.svg?branch=main)](https://coveralls.io/github/botflux/dependency-injection-container?branch=main)
[![Lightweight](https://img.shields.io/bundlephobia/minzip/@random-di/v1-loader)](https://bundlephobia.com/result?p=@random-di/v1-loader)
[![GitHub issues](https://img.shields.io/github/issues/botflux/random-di.svg)](https://GitHub.com/botflux/random-di/issues/)
[![GitHub license](https://img.shields.io/github/license/botflux/random-di.svg)](https://github.com/botflux/random-di/blob/main/LICENCE)

# `@random-di/v1-loader`

An adapter from `@botflx/dependency-injection-container` to `@random-di/container`.

## Installation

```shell
npm i --save @random-di/v1-loader
```

```shell
yarn add @random-di/v1-loader
```

## Usage

```typescript
import {createServiceContainer} from '@botflx/dependency-injection-container'
import {createContainerBuilder, SyncServiceProviderInterface} from '@random-di/container'
import {v1Loader} from '@random-di/v1-loader'

class ServiceA {
    public hello: string

    constructor(provider: SyncServiceProviderInterface) {
        this.hello = provider.get<string>('hello')
    }
}

const v1Container = createServiceContainer()
    .addFactory('hello', () => 'world')
    .add('ServiceA', ServiceA)

const v2Container = createContainerBuilder({
    loaders: [v1Loader(v1Container)]
}).build()

const hello = v2Container.get<string>('hello')
const serviceA = v2Container.get<ServiceA>('ServiceA')
```
