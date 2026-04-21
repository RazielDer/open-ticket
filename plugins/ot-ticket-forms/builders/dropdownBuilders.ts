import {api, opendiscord, utilities} from "#opendiscord"
import * as discord from "discord.js"
import { buildDropdownChoicesWithSavedSelections } from "../service/edit-mode-runtime"
import { OT_FORMS_EDIT_SAVED_ANSWER_PLACEHOLDER, createEditAnswerDropdownCustomId } from "../service/start-form-runtime"

// DROPDOWNS
opendiscord.events.get("onDropdownBuilderLoad").listen((dropdowns) => {
    dropdowns.add(new api.ODDropdown("ot-ticket-forms:question-dropdown"));
    dropdowns.get("ot-ticket-forms:question-dropdown").workers.add(
        new api.ODWorker("ot-ticket-forms:question-dropdown", 0, (instance, params, source, cancel) => {
            const { formInstanceId, sessionId, choices, minValues, maxValues, placeholder, savedAnswer } = params;

            const parsedChoices = buildDropdownChoicesWithSavedSelections(choices, savedAnswer ?? null)
            instance.setCustomId(`ot-ticket-forms:qd_${formInstanceId}_${sessionId}`);
            instance.setType("string");
            instance.setMaxValues(maxValues ? maxValues : 1);
            instance.setMinValues(minValues ? minValues : 1);
            instance.setPlaceholder(placeholder);
            instance.setOptions(parsedChoices);
        })
    );

    dropdowns.add(new api.ODDropdown("ot-ticket-forms:edit-answer-dropdown"));
    dropdowns.get("ot-ticket-forms:edit-answer-dropdown").workers.add(
        new api.ODWorker("ot-ticket-forms:edit-answer-dropdown", 0, (instance, params, source, cancel) => {
            const { formInstanceId, enabled, placeholder, options } = params;

            instance.setCustomId(createEditAnswerDropdownCustomId(formInstanceId));
            instance.setType("string");
            instance.setMinValues(1);
            instance.setMaxValues(1);
            instance.setDisabled(!enabled);
            instance.setPlaceholder(placeholder ?? OT_FORMS_EDIT_SAVED_ANSWER_PLACEHOLDER);
            instance.setOptions(options);
        })
    );
});
