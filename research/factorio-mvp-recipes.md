# Factorio placeholder recipes for the MVP item chain

Research for wayfinder ticket #4. Values come from Factorio **base game 2.0.77**, the latest 2.0.x tag in [wube/factorio-data](https://github.com/wube/factorio-data/tree/2.0.77). The wiki's infoboxes agree with every value checked.

Note: `master` in factorio-data is now **2.1.20**. For the recipes below, the only difference in 2.1 is a field rename (`category = "smelting"` becomes `categories = {"smelting"}`). Inputs, outputs and times are the same.

## Sources

- Recipes: [base/prototypes/recipe.lua @ 2.0.77](https://github.com/wube/factorio-data/blob/2.0.77/base/prototypes/recipe.lua)
- Stone furnace: [base/prototypes/entity/entities.lua @ 2.0.77](https://github.com/wube/factorio-data/blob/2.0.77/base/prototypes/entity/entities.lua) (`name = "stone-furnace"`)
- Mining drills: [base/prototypes/entity/mining-drill.lua @ 2.0.77](https://github.com/wube/factorio-data/blob/2.0.77/base/prototypes/entity/mining-drill.lua)
- Ore mining time: [base/prototypes/entity/resources.lua @ 2.0.77](https://github.com/wube/factorio-data/blob/2.0.77/base/prototypes/entity/resources.lua)
- Coal fuel value: [base/prototypes/item.lua @ 2.0.77](https://github.com/wube/factorio-data/blob/2.0.77/base/prototypes/item.lua)
- Wiki cross-check: [Rail](https://wiki.factorio.com/Rail), [Electronic circuit](https://wiki.factorio.com/Electronic_circuit), [Iron gear wheel](https://wiki.factorio.com/Iron_gear_wheel), [Copper cable](https://wiki.factorio.com/Copper_cable), [Stone furnace](https://wiki.factorio.com/Stone_furnace), [Burner mining drill](https://wiki.factorio.com/Burner_mining_drill), [Electric mining drill](https://wiki.factorio.com/Electric_mining_drill)

## Recipes

`energy_required` is the craft time in seconds at crafting speed 1. When a recipe does not set it, the engine default is **0.5 s**. The wiki infoboxes show 0.5 s for gear wheel, cable, circuit and rail.

| Recipe | Made in | Inputs | Output | Time (s) |
|---|---|---|---|---|
| Iron plate | furnace (`smelting`) | 1 iron ore | 1 iron plate | 3.2 |
| Copper plate | furnace (`smelting`) | 1 copper ore | 1 copper plate | 3.2 |
| Stone brick | furnace (`smelting`) | 2 stone | 1 stone brick | 3.2 |
| Iron gear wheel | assembler / hand | 2 iron plate | 1 iron gear wheel | 0.5 |
| Copper cable | assembler / hand | 1 copper plate | **2** copper cable | 0.5 |
| Electronic circuit | assembler / hand | 1 iron plate + 3 copper cable | 1 electronic circuit | 0.5 |
| Automation science pack | assembler / hand | 1 copper plate + 1 iron gear wheel | 1 automation science pack | 5 |
| Rail | assembler / hand | 1 stone + 1 iron stick + 1 steel plate | **2** rail | 0.5 |

Rail needs two intermediates that are not in the MVP chain:

| Recipe | Made in | Inputs | Output | Time (s) |
|---|---|---|---|---|
| Iron stick | assembler / hand | 1 iron plate | 2 iron stick | 0.5 |
| Steel plate | furnace (`smelting`) | 5 iron plate | 1 steel plate | 16 |

If the MVP should not model steel, a placeholder rail recipe must be simplified on purpose. That is a design decision for the ticket owner, not a Factorio fact.

## Machines

| Machine | Key stat | Energy | Source |
|---|---|---|---|
| Stone furnace | `crafting_speed = 1` | 90 kW burner, `fuel_categories = {"chemical"}`, effectivity 1, 2 pollution/min | entities.lua |
| Burner mining drill | `mining_speed = 0.25` | 150 kW burner | mining-drill.lua |
| Electric mining drill | `mining_speed = 0.5`, search radius 2.49 (5x5 area) | 90 kW electric | mining-drill.lua |

### Derived rates

Mining rate = `mining_speed / mining_time`. Iron ore, copper ore, coal and stone all have `mining_time = 1` (resources.lua).

- Burner mining drill: 0.25 ore/s (15/min)
- Electric mining drill: 0.5 ore/s (30/min)
- Stone furnace, iron or copper plate: 1 / 3.2 = 0.3125 plate/s (18.75/min). This matches the wiki Stone furnace page.
- Stone furnace, stone brick: 0.3125 brick/s, using 0.625 stone/s.

### Stone furnace fuel use (reference)

Coal has `fuel_value = "4MJ"` (item.lua). At 90 kW: 90 kJ/s / 4 MJ = **0.0225 coal/s** (1.35 coal/min). The wiki Stone furnace page gives the same value. Wood (2 MJ) doubles this. The same method gives 0.0375 coal/s for the burner mining drill (150 kW).
