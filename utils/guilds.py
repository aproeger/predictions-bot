def parse_guilds(input_string):
    values = input_string.split(',')
    int_values = [int(value) for value in values]
    return int_values