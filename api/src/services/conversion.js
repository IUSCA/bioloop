const INCLUDE = {
  argument_values: {
    include: {
      argument: true,
    },
  },
  definition: {
    include: {
      program: true,
    },
  },
  initiator: {
    select: {
      name: true,
      username: true,
    },
  },
};

function getArgsList(conversion) {
  const positionalArgList = conversion.argument_values
    .filter((argVal) => argVal.argument.position)
    .sort((a1, a2) => a1.argument.position - a2.argument.position)
    .map((argVal) => argVal.value);
  const argsList = conversion.argument_values
    .filter((argVal) => !argVal.argument.position)
    .flatMap((argVal) => {
      const arg = argVal.argument;
      if (arg.is_flag && (argVal.value === 'true' || argVal.value === true)) {
        return [arg.name];
      }
      return [arg.name, argVal.value];
    });

  return positionalArgList.concat(argsList);
}

module.exports = {
  INCLUDE,
  getArgsList,
};
