type Vertex<Key, Value> = {
    key: Key,
    value: Value
    neighbours: Key[]
}
type VisitVertex<Key, Value> = (vertex: Vertex<Key, Value>) => void

export class NoVertexError<Key> extends Error {
    constructor(public readonly key: Key) {
        super(`There is no vertex matching key "${key}".`)
    }
}

export class NoNeighbourError<Key> extends Error {
    constructor(
        public readonly parent: Key,
        public readonly neighbour: Key
    ) {
        super(`Can't add the vertex with key ${parent} since the neighbour with key ${neighbour} doesn't exist.`)
    }
}

export class DirectedAcyclicGraph<Key, Value> {
    private vertices: Vertex<Key, Value>[] = []

    addVertex(key: Key, value: Value, neighbours: Key[] = []): DirectedAcyclicGraph<Key, Value> {
        for (const neighbour of neighbours) {
            if (!this.isVertexExisting(neighbour)) {
                throw new NoNeighbourError(key, neighbour)
            }
        }

        this.vertices = [
            ...this.vertices,
            {key, value, neighbours}
        ]

        return this
    }

    isVertexExisting(key: Key): boolean {
        return !!this.getVertex(key)
    }

    getVertex(key: Key): Vertex<Key, Value> | undefined {
        return this.vertices.find(vertex =>
            vertex.key === key)
    }

    getVertexStrict(key: Key): Vertex<Key, Value> {
        const vertex = this.getVertex(key)

        if (!vertex)
            throw new NoVertexError(key)

        return vertex
    }

    areConnected(key1: Key, key2: Key): boolean {
        const vertex = this.getVertexStrict(key1)

        return !!vertex.neighbours.find(key => key === key2)
    }

    traverse(key: Key, visit: VisitVertex<Key, Value>): void {
        const vertex = this.getVertexStrict(key)

        visit(vertex)

        vertex.neighbours
            .forEach(key => this.traverse(key, visit))
    }
}
