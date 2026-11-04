# To Do DB audit (2026-10-29)

2327 rows backed up to `_archive/todo-backup-2026-10-29.json`.

## To Do properties

| Property | Type | Definition | Used by |
|---|---|---|---|
| Change Task | checkbox |  | To Do formula "Variation Hours Scheduled"; To Do formula "Contracted Hours Scheduled" |
| Task Done | checkbox |  | To Do formula "Sub Task Hours Spent"; To Do formula "Task Status 1" |
| End Date (Manual) | date |  | To Do formula "End Date" |
| Start Date | date |  | — |
| Approval Hrs | formula | `/* Check if Design Stage contains any approval stage values */ if(["Pre-Tranche 5E", "Tranche 5E", "Post-Tranche 5E", "MW S4 Approval"].some(prop("Design Stage 1").includes(current)),   prop("Task Hours (Est)"),   0 )` | Items (Tasks) rollup "1st Issue Hrs (Est)" |
| Contracted Hours Scheduled | formula | `/* Sum all sub task hours where the task is not a change task */ sum(if(not prop("Change Task"), prop("Task Hours (Est)"), 0))` | Items (Tasks) rollup "Contracted Hours Scheduled" |
| Contracted Hours Spent | formula | `sum(if(or(empty(prop("Variation Type")),prop("Variation Type")=="RFI"), prop("Sub Task Hours Spent"),0))` | To Do formula "Hours Per Scope"; Items (Tasks) rollup "Contracted Hours Spent" |
| End Date | formula | `/* First check if manual end date exists */ if(not empty(prop("End Date (Manual)")),   /* Use manual end date as override */   prop("End Date (Manual)"),   /* Otherwise use the original date calculation logic */   if(prop("Design Stage 1").includes("MW S4 Approval"),     /* Get first item's drawing and retrieve its planned S4 submission date */     if(prop("Item").length() > 0,       /* Navigate through item's drawing numbers to get first S4 plan date */       if(prop("Item").first().prop("Drawing No(s)").length() > 0,         prop("Item").first().prop("Drawing No(s)").first().prop("S4 Submit Date (Plan)"),         empty()       ),       empty()     ),     if(prop("Design Stage 1").includes("MW S5 Approval"),       /* Get first item's drawing and retrieve its planned S5 submission date */       if(prop("Item").length() > 0,         /* Navigate through item's drawing numbers to get first S5 plan date */         if(prop("Item").first().prop("Drawing No(s)").length() > 0,           prop("Item").first().prop("Drawing No(s)").first().prop("S5 Submit Date (Plan)"),           empty()         ),         empty()       ),       if(prop("Design Stage 1").includes("MW A4.5 Approval"),         /* Get first item's drawing and retrieve its planned C01 submission date */         if(prop("Item").length() > 0,           /* Navigate through item's drawing numbers to get first C01 plan date */           if(prop("Item").first().prop("Drawing No(s)").length() > 0,             prop("Item").first().prop("Drawing No(s)").first().prop("C01 Submit Date (Plan)"),             empty()           ),           empty()         ),         if(prop("Design Stage 1").includes("MW Production"),           /* Get first item's drawing and retrieve its planned production schedule date */           if(prop("Item").length() > 0,             /* Navigate through item's drawing numbers to get first production schedule plan date */             if(prop("Item").first().prop("Drawing No(s)").length() > 0,               prop("Item").first().prop("Drawing No(s)").first().prop("Schedule Production (Plan)"),               empty()             ),             empty()           ),           empty()         )       )     )   ) )` | — |
| Hours Per Scope | formula | `if({{notion:block_property:%3EwTe:fc05f861-67c7-4ccf-bedb-d35f0a2cd342:33328247-d72d-4da2-a95f-72bc967e279d}}=="Variation",prop("Variation Hours Spent"),prop("Contracted Hours Spent"))` | — |
| Production Hrs | formula | `/* Check if Design Stage contains any construction stage values */ if(["Construction", "MW Production"].some(prop("Design Stage 1").includes(current)),   prop("Task Hours (Est)"),   0 )` | Items (Tasks) rollup "Constr. Issue Hrs (Est)" |
| Revision Hrs | formula | `/* Check if Design Stage contains any revision stage values */ if(["Post-S4", "Post-S5", "MW S5 Approval", "MW A4.5 Approval"].some(prop("Design Stage 1").includes(current)),   prop("Task Hours (Est)"),   0 )` | Items (Tasks) rollup "2nd Issue Hrs (Est)" |
| Sub Task Hours Spent | formula | `if(prop("Task Done")==true,prop("Task Hours (Est)"),0)` | To Do formula "Total Hours Spent"; To Do formula "Variation Hours Spent"; To Do formula "Contracted Hours Spent"; Items (Tasks) rollup "Est. Hours Spent" |
| Task Status 1 | formula | `lets(   hasParent, not empty({{notion:block_property:b%3BNf:fc05f861-67c7-4ccf-bedb-d35f0a2cd342:33328247-d72d-4da2-a95f-72bc967e279d}}),   hasSubtasks, not empty({{notion:block_property:%3BbuE:fc05f861-67c7-4ccf-bedb-d35f0a2cd342:33328247-d72d-4da2-a95f-72bc967e279d}}),   isStandaloneTask, not hasParent and not hasSubtasks,   isSubtaskAndParent, hasParent and hasSubtasks,   hasNoBlockers, empty({{notion:block_property:hv%40%3C:fc05f861-67c7-4ccf-bedb-d35f0a2cd342:33328247-d72d-4da2-a95f-72bc967e279d}}) and empty({{notion:block_property:~_kZ:fc05f861-67c7-4ccf-bedb-d35f0a2cd342:33328247-d72d-4da2-a95f-72bc967e279d}}),   instructionReceived, {{notion:block_property:~_kZ:fc05f861-67c7-4ccf-bedb-d35f0a2cd342:33328247-d72d-4da2-a95f-72bc967e279d}} == "Instruction Received",      /* Determine status text and formatting based on task conditions */   ifs(     /* Case: Task has subtasks - return empty */     hasSubtasks,        empty(),     /* Case: Task with parent or standalone task (no parent and no subtasks) */     (hasParent or isStandaloneTask),       ifs(         hasNoBlockers or instructionReceived,           if(prop("Task Done") == false,             "🟠 " + "To Do".style("orange", "orange_background"),             "🟢 " + "Done".style("green", "green_background")           ),         /* Task is blocked */         "🔴 " + "On Hold".style("red", "red_background")       ),     /* Default case - should never reach here but included for safety */     ""   ) )` | To Do formula "Total Hours Spent" |
| Total Hours Spent | formula | `let(   /* Calculate the total of Sub Task Hours Spent for completed sub-tasks */   totalHours, {{notion:block_property:%3BbuE:fc05f861-67c7-4ccf-bedb-d35f0a2cd342:33328247-d72d-4da2-a95f-72bc967e279d}}     /* Only include sub-tasks that are marked as done */     .filter(current.prop("Task Status 1").contains("🟢 Done"))     /* Get the hours spent for each filtered sub-task */     .map(if(empty(current.prop("Sub Task Hours Spent")), 0, current.prop("Sub Task Hours Spent")))     /* Sum up all the hours spent values */     .sum(),      /* Return empty if total is 0, otherwise return the total */   if(totalHours == 0, empty(), totalHours) )` | — |
| Total Sub Task Hours | formula | `/* Check if this task has subtasks */ if({{notion:block_property:%3BbuE:fc05f861-67c7-4ccf-bedb-d35f0a2cd342:33328247-d72d-4da2-a95f-72bc967e279d}}.length() > 0,   /* Sum task hours from all subtasks */   {{notion:block_property:%3BbuE:fc05f861-67c7-4ccf-bedb-d35f0a2cd342:33328247-d72d-4da2-a95f-72bc967e279d}}     .map(       /* For each subtask, get its Task Hours */       current.prop("Task Hours (Est)") +       /* If the subtask is a parent task (has its own subtasks), add its subtask hours */       if(current.{{notion:block_property:%3BbuE:fc05f861-67c7-4ccf-bedb-d35f0a2cd342:33328247-d72d-4da2-a95f-72bc967e279d}}.length() > 0,          current.prop("Total Sub Task Hours"),          0       )     )     .sum(),   /* If no subtasks, return this task's Sub Task Hours */   prop("Task Hours (Est)") )` | — |
| Variation Hours Scheduled | formula | `sum(if(prop("Change Task"), prop("Task Hours (Est)"), 0))` | Items (Tasks) rollup "Variation Hours Scheduled" |
| Variation Hours Spent | formula | `sum(if(not(empty(prop("Variation Type"))),prop("Sub Task Hours Spent"),0))` | To Do formula "Hours Per Scope"; Items (Tasks) rollup "Variation Hours Spent" |
| Design Stage 1 | multi_select |  | To Do formula "End Date"; To Do formula "Revision Hrs"; To Do formula "Production Hrs"; To Do formula "Approval Hrs" |
| Task Hours (Est) | number |  | To Do formula "Variation Hours Scheduled"; To Do formula "Total Sub Task Hours"; To Do formula "Revision Hrs"; To Do formula "Sub Task Hours Spent"; To Do formula "Production Hrs"; To Do formula "Approval Hrs"; To Do formula "Contracted Hours Scheduled"; Items (Tasks) rollup "Total Scheduled Hours" |
| From Action | relation | → actions | Actions & Info relation "Task" |
| Item | relation | → tasks | To Do formula "End Date"; Items (Tasks) relation "To Do List" |
| Person | relation | → team | Team relation "To Do’s" |
| Related RFI | relation | → rfis | — |
| Related Variation | relation | → variations | Variations relation "Related Tasks"; RFIs relation "Related Tasks" |
| Dept | rollup | show_unique of Role via Person | — |
| Project | rollup | show_unique of Projects via Item | — |
| RFI ID | rollup | show_original of RFI Number via Related RFI | — |
| RFI Status | rollup | show_unique of RFI Status via Related RFI | — |
| Suffix No. | rollup | show_original of Drawing Ref via Item | — |
| TBC by | rollup | show_unique of TBC by via Related Variation | — |
| Variation Ref | rollup | show_unique of ID via Related Variation | — |
| Variation Status | rollup | show_unique of Variation Status via Related Variation | — |
| Variation Type | rollup | show_unique of Variation Type via Related Variation | To Do formula "Variation Hours Spent"; To Do formula "Contracted Hours Spent" |
| Design Stage | select |  | — |
| Status | select |  | — |
| Item Description | title |  | — |
| ID | unique_id |  | Variations rollup "TDL ID" |

## Rollups in other databases that read To Do

| Database | Rollup | Via | Reads | Function |
|---|---|---|---|---|
| Items (Tasks) | Est. Hours Spent | To Do List | Sub Task Hours Spent | sum |
| Items (Tasks) | Total Scheduled Hours | To Do List | Task Hours (Est) | sum |
| Items (Tasks) | Variation Hours Spent | To Do List | Variation Hours Spent | sum |
| Items (Tasks) | Constr. Issue Hrs (Est) | To Do List | Production Hrs | sum |
| Items (Tasks) | 2nd Issue Hrs (Est) | To Do List | Revision Hrs | sum |
| Items (Tasks) | 1st Issue Hrs (Est) | To Do List | Approval Hrs | sum |
| Items (Tasks) | Contracted Hours Scheduled | To Do List | Contracted Hours Scheduled | sum |
| Items (Tasks) | Variation Hours Scheduled | To Do List | Variation Hours Scheduled | sum |
| Items (Tasks) | Contracted Hours Spent | To Do List | Contracted Hours Spent | sum |
| Variations | TDL ID | Related Tasks | ID | show_unique |

## Formulas elsewhere that depend on those rollups

### Items (Tasks)

- **Est. Hrs Spent #** ← Est. Hours Spent
  `toNumber(prop("Est. Hours Spent"))`
- **Est. Hours Required** ← Total Scheduled Hours
  `/* Use Allocated Hours if Total Scheduled Hours is 0 */ if(prop("Total Scheduled Hours") == 0,    prop("Original Allocation (Hrs)"),    prop("Total Scheduled Hours") )`
- **Variation Hrs** ← Variation Hours Spent
  `if(prop("Variation Hours Spent") == 0 or empty(prop("Variation Hours Spent")),   empty(),   toNumber(format(prop("Variation Hours Spent"))) )`
- **Contract Hrs** ← Contracted Hours Spent
  `if(toNumber(format(prop("Contracted Hours Spent"))) == 0, empty(), toNumber(format(prop("Contracted Hours Spent"))))`
- **Remaining Hrs** ← Est. Hours Required
  `sum(prop("Est. Hours Required")-prop("Actual Hrs Spent"))`

### Variations

None.
