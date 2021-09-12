import {DirectedAcyclicGraph, NoVertexError} from '../src/DirectedAcyclicGraph'

describe('graph', () => {
    it('should add vertex to a graph', () => {
        const graph = new DirectedAcyclicGraph<string, string>()

        const foundVertex = graph
            .addVertex("hello", "world")
            .getVertex("hello")

        expect(foundVertex).toEqual({
            key: "hello",
            value: "world",
            neighbours: []
        })
    })

    it('should connect multiple vertices', () => {
        const graph = new DirectedAcyclicGraph<string, string>()

        const areConnected = graph
            .addVertex("bar", "value2")
            .addVertex("foo", "value1", [ 'bar' ])
            .areConnected("foo", "bar")

        expect(areConnected).toBe(true)
    })

    it('should traverse graph', () => {
        const onVertex = jest.fn()
        const graph = new DirectedAcyclicGraph<string, string>()

        graph.addVertex("world", "value4")
        graph.addVertex("hello", "value3")
        graph.addVertex("bar", "value2", [ 'world', 'hello' ])
        graph.addVertex("foo", "value1", [ 'bar' ])

        graph.traverse("foo", onVertex)

        expect(onVertex).toBeCalledTimes(4)
        expect(onVertex.mock.calls).toEqual([
            [ { key: "foo", value: "value1", neighbours: [ "bar" ] } ],
            [ { key: "bar", value: "value2", neighbours: [ "world", "hello" ] } ],
            [ { key: "world", value: "value4", neighbours: [] } ],
            [ { key: "hello", value: "value3", neighbours: [] } ],
        ])
    })

    it('should throw when there is no vertex', () => {
        const graph = new DirectedAcyclicGraph<string, string>()

        const shouldThrow = () => graph.getVertexStrict('foo')

        expect(shouldThrow).toThrow(NoVertexError)
    })
})
