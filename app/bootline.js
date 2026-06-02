export function createBootlineController(heroCommand, state) {
    function typeCommand(command) {
        if (!heroCommand) {
            return;
        }

        const nextCommand = command || "";

        state.typingToken += 1;
        const currentToken = state.typingToken;
        heroCommand.textContent = "";

        function step(index) {
            if (currentToken !== state.typingToken) {
                return;
            }

            heroCommand.textContent = nextCommand.slice(0, index);

            if (index <= nextCommand.length) {
                window.setTimeout(() => step(index + 1), 28);
            }
        }

        step(0);
    }

    return {
        typeCommand
    };
}