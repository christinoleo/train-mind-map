# Production nodes have typed connectors

Every input of a production node (Extractor, Furnace, Assembler, Generator, Lab) is dedicated to one ingredient of its recipe, and every output to one product. Each is marked with the item's icon and colour, like Factorio's fluid boxes. The recipe sets the connector count. An edge can attach only where its item matches, and changing a recipe disconnects the edges that no longer match, refunding them to the Core. Storage and logistics nodes (Core, Box, Station, Splitter, Merger) keep generic connectors.

This replaces "any ingredient enters through any input" (FR25 before 2026-09-25). The designer wanted each node to show what it asks for, so the graph reads as a recipe diagram and wrong-item jams cannot happen at production inputs.
