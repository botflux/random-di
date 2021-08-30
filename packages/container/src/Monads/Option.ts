import {Err, Ok, Result} from './Result'

export class SomeOption<Value> {
    public readonly isSome: boolean = true
    public readonly isNone: boolean = false

    constructor(private readonly value: Value) {
    }

    unwrap(): Value {
        return this.value
    }

    toResult(): Result<Value, Error> {
        return Ok(this.value)
    }

    map<NewValue>(func: (value: Value) => NewValue): Option<NewValue> {
        return new SomeOption(func(this.value))
    }

    unwrapOr(defaultValue: Value): Value {
        return this.value
    }
}

export class EmptyOptionError extends Error {
    constructor() {
        super('Can\'t unwrap an empty option')
    }
}

class NoneOption<Value> {
    public readonly isSome: boolean = false
    public readonly isNone: boolean = true

    unwrap(): Value {
        throw new EmptyOptionError()
    }

    toResult(): Result<Value, Error> {
        return Err(new EmptyOptionError())
    }

    map<NewValue>(func: (value: Value) => NewValue): Option<NewValue> {
        return this as unknown as Option<NewValue>
    }

    unwrapOr(defaultValue: Value): Value {
        return defaultValue
    }
}

export type Option<Value> = SomeOption<Value> | NoneOption<Value>
export const Some = <Value>(value: Value): Option<Value> => new SomeOption(value)
export const None: Option<any> = new NoneOption()
